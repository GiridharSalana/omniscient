"""
Technical Analysis Router — RSI, SMA, MACD, Bollinger Bands, Volume Anomalies.
Calculated from local price_data table. Includes a free historical data backfill
via Yahoo Finance v8 chart API (no key needed, no strict rate limits).
"""
from __future__ import annotations

import asyncio
import logging
import math
import time
from datetime import date, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from main import get_db

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Models ───────────────────────────────────────────────────────────
class TechSignal(BaseModel):
    symbol:         str
    name:           Optional[str]

    # Price levels
    price:          Optional[float]
    sma_20:         Optional[float]
    sma_50:         Optional[float]
    sma_200:        Optional[float]

    # Momentum
    rsi_14:         Optional[float]
    macd:           Optional[float]
    macd_signal:    Optional[float]
    macd_hist:      Optional[float]

    # Volatility
    bb_upper:       Optional[float]
    bb_lower:       Optional[float]
    bb_pct:         Optional[float]   # 0-1: where price sits in band

    # Range
    week_52_high:   Optional[float]
    week_52_low:    Optional[float]
    pct_from_high:  Optional[float]
    pct_from_low:   Optional[float]

    # Volume
    avg_volume_20:  Optional[float]
    last_volume:    Optional[float]
    volume_ratio:   Optional[float]   # last vs 20-day avg

    # Summary signals
    rsi_signal:     str   # oversold / neutral / overbought
    trend_signal:   str   # bullish / bearish / neutral
    ma_cross:       str   # golden_cross / death_cross / none
    volume_signal:  str   # high / normal / low
    overall:        str   # strong_buy / buy / hold / sell / strong_sell
    data_points:    int


class VolumeAnomaly(BaseModel):
    symbol:       str
    name:         Optional[str]
    price:        Optional[float]
    change_pct:   Optional[float]
    volume:       float
    avg_volume:   float
    volume_ratio: float
    direction:    str   # up / down / flat


# ── Pure Python TA calculations ──────────────────────────────────────
def calc_rsi(closes: list[float], period: int = 14) -> Optional[float]:
    if len(closes) < period + 1:
        return None
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains  = [max(d, 0) for d in deltas]
    losses = [max(-d, 0) for d in deltas]

    # Wilder smoothing
    avg_g = sum(gains[:period]) / period
    avg_l = sum(losses[:period]) / period
    for i in range(period, len(gains)):
        avg_g = (avg_g * (period - 1) + gains[i]) / period
        avg_l = (avg_l * (period - 1) + losses[i]) / period

    if avg_l == 0:
        return 100.0
    rs = avg_g / avg_l
    return round(100 - (100 / (1 + rs)), 2)


def calc_sma(closes: list[float], period: int) -> Optional[float]:
    if len(closes) < period:
        return None
    return round(sum(closes[-period:]) / period, 4)


def calc_ema(closes: list[float], period: int) -> Optional[float]:
    if len(closes) < period:
        return None
    k = 2 / (period + 1)
    ema = sum(closes[:period]) / period
    for p in closes[period:]:
        ema = p * k + ema * (1 - k)
    return round(ema, 4)


def calc_macd(closes: list[float]) -> tuple[Optional[float], Optional[float], Optional[float]]:
    if len(closes) < 35:
        return None, None, None
    ema12 = calc_ema(closes, 12)
    ema26 = calc_ema(closes, 26)
    if ema12 is None or ema26 is None:
        return None, None, None
    macd_line = round(ema12 - ema26, 4)

    # Build MACD series for signal line (9-period EMA of MACD)
    macd_series = []
    k12 = 2 / 13; k26 = 2 / 27
    e12 = sum(closes[:12]) / 12
    e26 = sum(closes[:26]) / 26
    for p in closes[12:]:
        e12 = p * k12 + e12 * (1 - k12)
    for p in closes[26:]:
        e26 = p * k26 + e26 * (1 - k26)
        macd_series.append(e12 - e26)

    if len(macd_series) < 9:
        return macd_line, None, None
    signal = sum(macd_series[-9:]) / 9
    k_sig = 2 / 10
    for m in macd_series[-8:]:
        signal = m * k_sig + signal * (1 - k_sig)
    hist = round(macd_line - signal, 4)
    return macd_line, round(signal, 4), hist


def calc_bollinger(closes: list[float], period: int = 20, std_mult: float = 2.0):
    if len(closes) < period:
        return None, None, None
    window = closes[-period:]
    sma    = sum(window) / period
    std    = math.sqrt(sum((x - sma) ** 2 for x in window) / period)
    upper  = round(sma + std_mult * std, 4)
    lower  = round(sma - std_mult * std, 4)
    price  = closes[-1]
    band_width = upper - lower
    pct = round((price - lower) / band_width, 4) if band_width > 0 else 0.5
    return round(upper, 4), round(lower, 4), pct


def classify_rsi(rsi: Optional[float]) -> str:
    if rsi is None:
        return "neutral"
    if rsi <= 30:
        return "oversold"
    if rsi >= 70:
        return "overbought"
    return "neutral"


def classify_trend(price: Optional[float], sma20: Optional[float], sma50: Optional[float]) -> str:
    if price is None:
        return "neutral"
    above20 = sma20 is not None and price > sma20
    above50 = sma50 is not None and price > sma50
    if above20 and above50:
        return "bullish"
    if not above20 and not above50:
        return "bearish"
    return "neutral"


def classify_ma_cross(sma50: Optional[float], sma200: Optional[float]) -> str:
    if sma50 is None or sma200 is None:
        return "none"
    if sma50 > sma200 * 1.01:
        return "golden_cross"
    if sma50 < sma200 * 0.99:
        return "death_cross"
    return "none"


def classify_volume(ratio: Optional[float]) -> str:
    if ratio is None:
        return "normal"
    if ratio >= 2.0:
        return "high"
    if ratio <= 0.5:
        return "low"
    return "normal"


def overall_signal(
    rsi_sig: str, trend_sig: str, macd_hist: Optional[float],
    vol_sig: str, ma_cross: str, bb_pct: Optional[float],
) -> str:
    score = 0

    # RSI (most weight)
    if rsi_sig == "oversold":    score += 3   # strong buy signal
    if rsi_sig == "overbought":  score -= 3   # strong sell signal

    # MA trend
    if trend_sig == "bullish":   score += 2
    if trend_sig == "bearish":   score -= 2

    # MACD histogram direction
    if macd_hist is not None:
        if macd_hist > 0:        score += 1
        else:                    score -= 1

    # Volume confirmation
    if vol_sig == "high":
        # High volume amplifies the trend signal
        if trend_sig == "bullish": score += 1
        if trend_sig == "bearish": score -= 1

    # MA cross (strong signal)
    if ma_cross == "golden_cross": score += 2
    if ma_cross == "death_cross":  score -= 2

    # Bollinger Band position
    if bb_pct is not None:
        if bb_pct <= 0.1:    score += 1   # near lower band = oversold
        if bb_pct >= 0.9:    score -= 1   # near upper band = overbought

    if score >= 5:    return "strong_buy"
    if score >= 2:    return "buy"
    if score <= -5:   return "strong_sell"
    if score <= -2:   return "sell"
    return "hold"


# ── DB query helper ──────────────────────────────────────────────────
async def _get_prices(db: AsyncSession, symbol: str, limit: int = 250) -> list[dict]:
    rows = await db.execute(text("""
        SELECT ts, open, high, low, close, volume
        FROM price_data
        WHERE symbol = :sym
        ORDER BY ts DESC
        LIMIT :lim
    """), {"sym": symbol, "lim": limit})
    return [dict(r._mapping) for r in rows]


# ── Endpoints ────────────────────────────────────────────────────────
@router.get("/signals", response_model=list[TechSignal])
async def technical_signals(db: AsyncSession = Depends(get_db)):
    """
    Technical signals for all watchlist symbols.
    RSI, SMA 20/50/200, MACD, Bollinger Bands, 52-week range, volume ratio.
    All computed from local price_data — no extra API calls.
    """
    # Use watchlist symbols — consistent Yahoo Finance price data
    # Exclude market index symbols (^ prefix) to avoid price scale mismatches
    wl = await db.execute(text("""
        SELECT w.symbol, i.name
        FROM watchlist w
        LEFT JOIN indices i ON i.symbol = w.symbol
        WHERE (SELECT COUNT(*) FROM price_data p WHERE p.symbol = w.symbol) >= 5
        ORDER BY w.added_at
    """))
    symbols = [(r.symbol, r.name) for r in wl]

    # If no watchlist data, fall back to any non-index symbols in price_data
    if not symbols:
        fallback = await db.execute(text("""
            SELECT symbol, NULL as name
            FROM (SELECT symbol, COUNT(*) as cnt FROM price_data GROUP BY symbol) sub
            WHERE cnt >= 20 AND symbol NOT LIKE '%%^%%' AND symbol NOT LIKE '%%=%%'
            ORDER BY cnt DESC LIMIT 20
        """))
        symbols = [(r.symbol, r.name) for r in fallback]

    results = []
    for symbol, name in symbols:
        rows = await _get_prices(db, symbol, 260)
        if not rows:
            continue

        # Sort ascending for calculations
        rows_asc = list(reversed(rows))
        closes  = [float(r["close"])  for r in rows_asc if r["close"]  is not None]
        volumes = [float(r["volume"]) for r in rows_asc if r["volume"] is not None]
        highs   = [float(r["high"])   for r in rows_asc if r["high"]   is not None]
        lows    = [float(r["low"])    for r in rows_asc if r["low"]    is not None]

        if len(closes) < 5:
            continue

        price = closes[-1]
        n = len(closes)

        # Indicators
        rsi  = calc_rsi(closes)
        sma20 = calc_sma(closes, 20)
        sma50 = calc_sma(closes, 50)
        sma200= calc_sma(closes, 200)
        macd_line, macd_sig, macd_hist = calc_macd(closes)
        bb_up, bb_lo, bb_pct = calc_bollinger(closes)

        # 52-week range (use up to 252 trading days)
        hi52 = max(highs[-252:]) if len(highs) >= 1 else None
        lo52 = min(lows[-252:])  if len(lows)  >= 1 else None
        pct_from_high = round(((price - hi52) / hi52) * 100, 2) if hi52 else None
        pct_from_low  = round(((price - lo52) / lo52) * 100, 2) if lo52 else None

        # Volume
        avg_vol20 = calc_sma(volumes, 20)
        last_vol  = volumes[-1] if volumes else None
        vol_ratio = round(last_vol / avg_vol20, 2) if avg_vol20 and last_vol else None

        # Signals
        rsi_sig  = classify_rsi(rsi)
        trend    = classify_trend(price, sma20, sma50)
        ma_cross = classify_ma_cross(sma50, sma200)
        vol_sig  = classify_volume(vol_ratio)
        overall  = overall_signal(rsi_sig, trend, macd_hist, vol_sig, ma_cross, bb_pct)

        results.append(TechSignal(
            symbol        = symbol,
            name          = name,
            price         = round(price, 4),
            sma_20        = sma20,
            sma_50        = sma50,
            sma_200       = sma200,
            rsi_14        = rsi,
            macd          = macd_line,
            macd_signal   = macd_sig,
            macd_hist     = macd_hist,
            bb_upper      = bb_up,
            bb_lower      = bb_lo,
            bb_pct        = bb_pct,
            week_52_high  = round(hi52, 4) if hi52 else None,
            week_52_low   = round(lo52, 4) if lo52 else None,
            pct_from_high = pct_from_high,
            pct_from_low  = pct_from_low,
            avg_volume_20 = round(avg_vol20, 0) if avg_vol20 else None,
            last_volume   = last_vol,
            volume_ratio  = vol_ratio,
            rsi_signal    = rsi_sig,
            trend_signal  = trend,
            ma_cross      = ma_cross,
            volume_signal = vol_sig,
            overall       = overall,
            data_points   = n,
        ))

    return results


@router.get("/volume-anomalies", response_model=list[VolumeAnomaly])
async def volume_anomalies(
    min_ratio: float = 2.0,
    db: AsyncSession = Depends(get_db),
):
    """
    Stocks with unusual volume (default: 2x+ normal).
    Volume anomalies often precede large price moves — key alpha signal.
    """
    rows = await db.execute(text("""
        WITH recent AS (
            SELECT
                p.symbol,
                i.name,
                p.close,
                p.volume,
                LAG(p.close) OVER (PARTITION BY p.symbol ORDER BY p.ts) AS prev_close,
                AVG(p.volume) OVER (
                    PARTITION BY p.symbol
                    ORDER BY p.ts
                    ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING
                ) AS avg_vol_20,
                ROW_NUMBER() OVER (PARTITION BY p.symbol ORDER BY p.ts DESC) AS rn
            FROM price_data p
            LEFT JOIN indices i ON i.symbol = p.symbol
            WHERE p.volume IS NOT NULL
        )
        SELECT
            symbol, name, close, volume, prev_close, avg_vol_20,
            CASE
                WHEN avg_vol_20 > 0 THEN ROUND((volume / avg_vol_20)::numeric, 2)
                ELSE 0
            END AS vol_ratio
        FROM recent
        WHERE rn = 1
          AND avg_vol_20 > 0
          AND volume / avg_vol_20 >= :min_ratio
        ORDER BY vol_ratio DESC
    """), {"min_ratio": min_ratio})

    anomalies = []
    for r in rows:
        price = float(r.close) if r.close else None
        prev  = float(r.prev_close) if r.prev_close else None
        chg   = round(((price - prev) / prev) * 100, 2) if price and prev else None
        direction = "up" if chg and chg > 0.5 else ("down" if chg and chg < -0.5 else "flat")
        anomalies.append(VolumeAnomaly(
            symbol       = r.symbol,
            name         = r.name,
            price        = price,
            change_pct   = chg,
            volume       = float(r.volume),
            avg_volume   = float(r.avg_vol_20),
            volume_ratio = float(r.vol_ratio),
            direction    = direction,
        ))
    return anomalies


@router.post("/backfill")
async def backfill_price_history(db: AsyncSession = Depends(get_db)):
    """
    Fetch 6-month daily price history from Yahoo Finance v8 API (free, no key)
    for all symbols in the watchlist and store in price_data.
    Call this once to populate the historical data needed for RSI/MA calculations.
    """
    wl = await db.execute(text("SELECT symbol FROM watchlist ORDER BY added_at"))
    symbols = [r.symbol for r in wl]

    # Also grab symbols already in price_data with < 10 rows
    sparse = await db.execute(text("""
        SELECT symbol FROM (
            SELECT symbol, COUNT(*) as cnt FROM price_data GROUP BY symbol
        ) sub WHERE cnt < 20
    """))
    for r in sparse:
        if r.symbol not in symbols:
            symbols.append(r.symbol)

    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        "Accept": "application/json",
    }
    inserted_total = 0
    errors = []

    async with httpx.AsyncClient(timeout=20, headers=headers, follow_redirects=True) as client:
        for symbol in symbols:
            try:
                r = await client.get(
                    f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
                    params={"range": "6mo", "interval": "1d", "includeAdjustedClose": "true"},
                )
                if r.status_code != 200:
                    errors.append(f"{symbol}: HTTP {r.status_code}")
                    continue
                data = r.json()
                result = data.get("chart", {}).get("result", [])
                if not result:
                    errors.append(f"{symbol}: no result")
                    continue
                result = result[0]
                timestamps = result.get("timestamp", [])
                quote = result.get("indicators", {}).get("quote", [{}])[0]
                opens   = quote.get("open", [])
                highs   = quote.get("high", [])
                lows    = quote.get("low", [])
                closes  = quote.get("close", [])
                volumes = quote.get("volume", [])
                adj_q   = result.get("indicators", {}).get("adjclose", [{}])
                adjs    = adj_q[0].get("adjclose", []) if adj_q else []

                inserted = 0
                for i, ts in enumerate(timestamps):
                    if i >= len(closes) or closes[i] is None:
                        continue
                    dt = date.fromtimestamp(ts)
                    await db.execute(text("""
                        INSERT INTO price_data (symbol, ts, open, high, low, close, volume, adj_close)
                        VALUES (:sym, :ts, :o, :h, :l, :c, :v, :a)
                        ON CONFLICT (symbol, ts) DO UPDATE SET
                            open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low,
                            close=EXCLUDED.close, volume=EXCLUDED.volume, adj_close=EXCLUDED.adj_close
                    """), {
                        "sym": symbol,
                        "ts":  dt,
                        "o":   opens[i]   if i < len(opens)   else None,
                        "h":   highs[i]   if i < len(highs)   else None,
                        "l":   lows[i]    if i < len(lows)    else None,
                        "c":   closes[i],
                        "v":   int(volumes[i]) if i < len(volumes) and volumes[i] else None,
                        "a":   adjs[i]    if i < len(adjs)    else None,
                    })
                    inserted += 1

                await db.commit()
                inserted_total += inserted
                logger.info("Backfilled %s: %d rows", symbol, inserted)
                await asyncio.sleep(0.3)  # polite delay

            except Exception as e:
                errors.append(f"{symbol}: {e}")
                logger.warning("Backfill error for %s: %s", symbol, e)

    return {
        "status": "ok",
        "symbols_processed": len(symbols),
        "rows_inserted": inserted_total,
        "errors": errors,
    }


@router.get("/signal/{symbol}", response_model=TechSignal)
async def symbol_signal(symbol: str, db: AsyncSession = Depends(get_db)):
    """Full technical signal for a single symbol."""
    rows = await _get_prices(db, symbol.upper(), 260)
    name_row = await db.execute(text("SELECT name FROM indices WHERE symbol = :s"), {"s": symbol.upper()})
    name_r = name_row.fetchone()
    name = name_r[0] if name_r else None

    if not rows:
        from fastapi import HTTPException
        raise HTTPException(404, f"No price data for {symbol}")

    rows_asc = list(reversed(rows))
    closes  = [float(r["close"])  for r in rows_asc if r["close"]  is not None]
    volumes = [float(r["volume"]) for r in rows_asc if r["volume"] is not None]
    highs   = [float(r["high"])   for r in rows_asc if r["high"]   is not None]
    lows    = [float(r["low"])    for r in rows_asc if r["low"]    is not None]

    price = closes[-1] if closes else None
    rsi   = calc_rsi(closes)
    sma20 = calc_sma(closes, 20)
    sma50 = calc_sma(closes, 50)
    sma200= calc_sma(closes, 200)
    macd_line, macd_sig, macd_hist = calc_macd(closes)
    bb_up, bb_lo, bb_pct = calc_bollinger(closes)

    hi52 = max(highs[-252:]) if highs else None
    lo52 = min(lows[-252:])  if lows  else None
    pct_from_high = round(((price - hi52) / hi52) * 100, 2) if hi52 and price else None
    pct_from_low  = round(((price - lo52) / lo52) * 100, 2) if lo52 and price else None

    avg_vol20 = calc_sma(volumes, 20)
    last_vol  = volumes[-1] if volumes else None
    vol_ratio = round(last_vol / avg_vol20, 2) if avg_vol20 and last_vol else None

    rsi_sig  = classify_rsi(rsi)
    trend    = classify_trend(price, sma20, sma50)
    ma_cross = classify_ma_cross(sma50, sma200)
    vol_sig  = classify_volume(vol_ratio)
    overall  = overall_signal(rsi_sig, trend, macd_hist, vol_sig, ma_cross, bb_pct)

    return TechSignal(
        symbol=symbol.upper(), name=name, price=round(price,4) if price else None,
        sma_20=sma20, sma_50=sma50, sma_200=sma200,
        rsi_14=rsi, macd=macd_line, macd_signal=macd_sig, macd_hist=macd_hist,
        bb_upper=bb_up, bb_lower=bb_lo, bb_pct=bb_pct,
        week_52_high=round(hi52,4) if hi52 else None,
        week_52_low=round(lo52,4) if lo52 else None,
        pct_from_high=pct_from_high, pct_from_low=pct_from_low,
        avg_volume_20=round(avg_vol20,0) if avg_vol20 else None,
        last_volume=last_vol, volume_ratio=vol_ratio,
        rsi_signal=rsi_sig, trend_signal=trend, ma_cross=ma_cross,
        volume_signal=vol_sig, overall=overall, data_points=len(closes),
    )
