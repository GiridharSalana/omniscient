"""
India Market Intelligence Router
PCR (Put-Call Ratio), FII/DII flows, India VIX details, Max Pain.
Fetches from NSE free endpoints with proper session handling.
"""
from __future__ import annotations

import json
import logging
import asyncio
from datetime import datetime, timezone, date, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from main import get_db, get_redis

logger = logging.getLogger(__name__)
router = APIRouter()

NSE_BASE = "https://www.nseindia.com"
NSE_HEADERS = {
    "User-Agent":      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept":          "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer":         "https://www.nseindia.com/",
    "X-Requested-With": "XMLHttpRequest",
}

CACHE_PCR     = 600   # 10 min
CACHE_FIIDII  = 3600  # 1 hr (updated by NSE at ~5PM)
CACHE_VIXHIST = 3600


# ── Models ────────────────────────────────────────────────────────
class PCRData(BaseModel):
    nifty_pcr:      Optional[float]
    banknifty_pcr:  Optional[float]
    nifty_signal:   str   # bullish / bearish / neutral
    banknifty_signal: str
    nifty_call_oi:  Optional[float]
    nifty_put_oi:   Optional[float]
    max_pain:       Optional[float]
    resistance:     Optional[float]  # highest call OI strike
    support:        Optional[float]  # highest put OI strike
    source:         str
    updated_at:     str


class FIIDIIRow(BaseModel):
    date:       str
    fii_net:    float
    dii_net:    float
    combined:   float
    fii_buy:    float
    fii_sell:   float
    dii_buy:    float
    dii_sell:   float


class FIIDIIData(BaseModel):
    today:       Optional[FIIDIIRow]
    history:     list[FIIDIIRow]
    fii_signal:  str    # bullish / bearish / neutral
    source:      str
    updated_at:  str


# ── NSE Session helper ────────────────────────────────────────────
async def _nse_session() -> Optional[dict]:
    """Get NSE session cookies by visiting the home page."""
    try:
        async with httpx.AsyncClient(
            timeout=15, headers={"User-Agent": NSE_HEADERS["User-Agent"]},
            follow_redirects=True
        ) as client:
            r = await client.get(NSE_BASE)
            if r.status_code == 200:
                return dict(r.cookies)
    except Exception as e:
        logger.warning("NSE session failed: %s", e)
    return None


async def _nse_fetch(path: str, cookies: Optional[dict] = None) -> Optional[dict]:
    """Fetch from NSE API endpoint."""
    try:
        async with httpx.AsyncClient(
            timeout=15, headers=NSE_HEADERS,
            cookies=cookies or {}, follow_redirects=True
        ) as client:
            r = await client.get(f"{NSE_BASE}{path}")
            if r.status_code == 200:
                return r.json()
    except Exception as e:
        logger.warning("NSE fetch %s failed: %s", path, e)
    return None


# ── PCR from options chain ────────────────────────────────────────
def _interpret_pcr(pcr: Optional[float]) -> str:
    if pcr is None:
        return "neutral"
    if pcr < 0.7:
        return "bearish"    # more calls = market bearish on puts
    if pcr < 0.85:
        return "slightly_bearish"
    if pcr < 1.05:
        return "neutral"
    if pcr < 1.2:
        return "slightly_bullish"
    return "bullish"        # more puts = contrarian bullish


@router.get("/pcr", response_model=PCRData)
async def get_pcr(
    redis = Depends(get_redis),
):
    """
    Nifty & Bank Nifty Put-Call Ratio from NSE options chain.
    PCR < 0.7 = bearish | 0.7-1.0 = neutral | > 1.0 = bullish (contrarian).
    """
    cache_key = "india:pcr"
    cached = await redis.get(cache_key)
    if cached:
        return PCRData(**json.loads(cached))

    # Try to get session cookies
    cookies = await _nse_session()

    nifty_pcr     = None
    bnifty_pcr    = None
    total_call_oi = None
    total_put_oi  = None
    max_pain      = None
    resistance    = None
    support       = None

    for symbol in ["NIFTY", "BANKNIFTY"]:
        data = await _nse_fetch(f"/api/option-chain-indices?symbol={symbol}", cookies)
        if not data:
            await asyncio.sleep(1)
            cookies = await _nse_session()
            data = await _nse_fetch(f"/api/option-chain-indices?symbol={symbol}", cookies)

        if data:
            try:
                records = data.get("records", {}).get("data", [])
                call_oi = sum(r.get("CE", {}).get("openInterest", 0) for r in records if "CE" in r)
                put_oi  = sum(r.get("PE", {}).get("openInterest", 0) for r in records if "PE" in r)
                pcr = round(put_oi / call_oi, 3) if call_oi > 0 else None

                if symbol == "NIFTY":
                    nifty_pcr     = pcr
                    total_call_oi = call_oi
                    total_put_oi  = put_oi

                    # Max pain — find strike where total OI loss is minimized
                    strikes: dict[float, dict] = {}
                    for r in records:
                        st = r.get("strikePrice")
                        if st:
                            strikes[st] = {
                                "call_oi": r.get("CE", {}).get("openInterest", 0),
                                "put_oi":  r.get("PE", {}).get("openInterest", 0),
                            }

                    # Highest call OI = resistance
                    if strikes:
                        by_call = sorted(strikes.items(), key=lambda x: x[1]["call_oi"], reverse=True)
                        by_put  = sorted(strikes.items(), key=lambda x: x[1]["put_oi"],  reverse=True)
                        resistance = by_call[0][0] if by_call else None
                        support    = by_put[0][0]  if by_put  else None

                        # Max pain calculation
                        all_strikes = sorted(strikes.keys())
                        min_loss = float("inf")
                        for test_price in all_strikes:
                            total_loss = sum(
                                strikes[st]["call_oi"] * max(0, st - test_price) +
                                strikes[st]["put_oi"]  * max(0, test_price - st)
                                for st in all_strikes
                            )
                            if total_loss < min_loss:
                                min_loss  = total_loss
                                max_pain  = test_price

                elif symbol == "BANKNIFTY":
                    bnifty_pcr = pcr

            except Exception as e:
                logger.warning("PCR parse error for %s: %s", symbol, e)

        await asyncio.sleep(0.5)

    result = PCRData(
        nifty_pcr        = nifty_pcr,
        banknifty_pcr    = bnifty_pcr,
        nifty_signal     = _interpret_pcr(nifty_pcr),
        banknifty_signal = _interpret_pcr(bnifty_pcr),
        nifty_call_oi    = total_call_oi,
        nifty_put_oi     = total_put_oi,
        max_pain         = max_pain,
        resistance       = resistance,
        support          = support,
        source           = "NSE" if nifty_pcr else "unavailable",
        updated_at       = datetime.now(timezone.utc).isoformat(),
    )

    if nifty_pcr:
        await redis.setex(cache_key, CACHE_PCR, result.model_dump_json())

    return result


# ── FII / DII flows ───────────────────────────────────────────────
def _fii_signal(fii_net: float, dii_net: float) -> str:
    if fii_net > 500 and dii_net > 0:    return "strongly_bullish"
    if fii_net > 0   and dii_net > 0:    return "bullish"
    if fii_net > 0   and dii_net < 0:    return "cautious"
    if fii_net < 0   and dii_net > 500:  return "supported"
    if fii_net < 0   and dii_net < 0:    return "bearish"
    if fii_net < -500: return "strongly_bearish"
    return "neutral"


@router.get("/fii-dii", response_model=FIIDIIData)
async def get_fii_dii(
    redis = Depends(get_redis),
):
    """
    FII and DII net flows in Indian equity market (cash segment).
    Published by NSE daily ~5 PM IST.
    """
    cache_key = "india:fii_dii"
    cached = await redis.get(cache_key)
    if cached:
        return FIIDIIData(**json.loads(cached))

    cookies = await _nse_session()
    data = await _nse_fetch("/api/fiidiiTradeReact", cookies)

    rows: list[FIIDIIRow] = []

    if data:
        try:
            for item in data[:10]:  # last 10 days
                fii_buy  = float(item.get("fiiBuy",  0) or 0)
                fii_sell = float(item.get("fiiSell", 0) or 0)
                dii_buy  = float(item.get("diiBuy",  0) or 0)
                dii_sell = float(item.get("diiSell", 0) or 0)
                fii_net  = fii_buy - fii_sell
                dii_net  = dii_buy - dii_sell
                rows.append(FIIDIIRow(
                    date     = item.get("date", ""),
                    fii_net  = round(fii_net, 2),
                    dii_net  = round(dii_net, 2),
                    combined = round(fii_net + dii_net, 2),
                    fii_buy  = round(fii_buy, 2),
                    fii_sell = round(fii_sell, 2),
                    dii_buy  = round(dii_buy, 2),
                    dii_sell = round(dii_sell, 2),
                ))
        except Exception as e:
            logger.warning("FII/DII parse error: %s", e)

    today_row = rows[0] if rows else None
    signal = _fii_signal(today_row.fii_net if today_row else 0,
                         today_row.dii_net if today_row else 0)

    result = FIIDIIData(
        today      = today_row,
        history    = rows,
        fii_signal = signal,
        source     = "NSE" if rows else "unavailable",
        updated_at = datetime.now(timezone.utc).isoformat(),
    )

    if rows:
        await redis.setex(cache_key, CACHE_FIIDII, result.model_dump_json())

    return result


# ── India VIX history ─────────────────────────────────────────────
@router.get("/vix-history")
async def get_vix_history(
    days: int = 30,
    redis = Depends(get_redis),
    db: AsyncSession = Depends(get_db),
):
    """India VIX historical values from price_data table."""
    cache_key = f"india:vix:{days}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    result = await db.execute(text("""
        SELECT ts::date as date, close as vix
        FROM price_data
        WHERE symbol = '^INDIAVIX'
        ORDER BY ts DESC
        LIMIT :days
    """), {"days": days})
    rows = [{"date": str(r.date), "vix": float(r.vix)} for r in result.fetchall()]
    rows.reverse()

    await redis.setex(cache_key, CACHE_VIXHIST, json.dumps(rows))
    return rows


# ── F&O Expiry calendar ───────────────────────────────────────────
@router.get("/expiry-calendar")
async def get_expiry_calendar():
    """Return NSE F&O weekly and monthly expiry dates for next 3 months."""
    today = date.today()
    expiries = []

    # Generate Thursdays for next 90 days
    d = today
    while (d - today).days < 90:
        if d.weekday() == 3 and d > today:  # Thursday
            # Monthly = last Thursday of month
            next_month_first = date(d.year, d.month % 12 + 1, 1) if d.month < 12 else date(d.year + 1, 1, 1)
            last_thursday = next_month_first - timedelta(days=1)
            while last_thursday.weekday() != 3:
                last_thursday -= timedelta(days=1)
            is_monthly = d == last_thursday

            days_left = (d - today).days
            expiries.append({
                "date":      str(d),
                "type":      "monthly" if is_monthly else "weekly",
                "label":     f"{'Monthly' if is_monthly else 'Weekly'} F&O Expiry",
                "days_left": days_left,
            })
        d += timedelta(days=1)

    return expiries[:12]  # next 12 expiries
