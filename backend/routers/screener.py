"""
Stock Screener Router
Filter stocks by technical criteria using preset or custom scans.
Universe: Nifty 50 + top US stocks (uses local price_data + live Yahoo Finance quotes).
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from data_ingestion import DataIngestionEngine
from main import get_db, get_redis

logger = logging.getLogger(__name__)
router = APIRouter()
ingestion = DataIngestionEngine()

# ── Universe ──────────────────────────────────────────────────────
NIFTY50 = [
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
    "HINDUNILVR.NS", "KOTAKBANK.NS", "AXISBANK.NS", "LT.NS", "SUNPHARMA.NS",
    "BAJFINANCE.NS", "BHARTIARTL.NS", "WIPRO.NS", "ULTRACEMCO.NS", "POWERGRID.NS",
    "NTPC.NS", "ASIANPAINT.NS", "MARUTI.NS", "TITAN.NS", "TECHM.NS",
    "JSWSTEEL.NS", "HINDALCO.NS", "TATASTEEL.NS", "ONGC.NS", "BPCL.NS",
    "COALINDIA.NS", "SBIN.NS", "HCLTECH.NS", "BAJAJFINSV.NS", "ADANIPORTS.NS",
    "INDUSINDBK.NS", "NESTLEIND.NS", "BRITANNIA.NS", "CIPLA.NS", "DIVISLAB.NS",
    "DRREDDY.NS", "EICHERMOT.NS", "GRASIM.NS", "SBILIFE.NS", "BAJAJ-AUTO.NS",
    "HDFCLIFE.NS", "APOLLOHOSP.NS", "TATAMOTORS.NS", "LTIM.NS", "SHREECEM.NS",
    "M&M.NS", "HEROMOTOCO.NS", "TATACONSUM.NS", "PIDILITIND.NS", "ADANIENT.NS",
]

US_STOCKS = [
    "AAPL", "NVDA", "MSFT", "AMZN", "META", "GOOGL", "TSLA", "AMD",
    "JPM", "GS", "BAC", "XOM", "CVX", "NFLX", "CRM", "UBER",
    "SPY", "QQQ", "GLD", "TLT",
]

FULL_UNIVERSE = NIFTY50 + US_STOCKS

PRESET_DEFINITIONS: dict[str, dict] = {
    "momentum_breakout": {
        "label": "Momentum Breakouts",
        "desc":  "1D gain ≥ 2%, volume ≥ 1.5× average",
        "icon":  "🚀",
        "color": "#00d68f",
    },
    "oversold_bounce": {
        "label": "Oversold Bounce",
        "desc":  "RSI ≤ 35, price above 200 SMA",
        "icon":  "📈",
        "color": "#4ade80",
    },
    "near_52w_high": {
        "label": "52-Week High Breakers",
        "desc":  "Within 2% of 52-week high",
        "icon":  "🏔️",
        "color": "#a78bfa",
    },
    "volume_surge": {
        "label": "Volume Surge",
        "desc":  "Volume ≥ 2.5× 20-day average",
        "icon":  "⚡",
        "color": "#f59e0b",
    },
    "gap_up": {
        "label": "Gap Ups",
        "desc":  "Opened ≥ 1% above prior close",
        "icon":  "⬆️",
        "color": "#00d68f",
    },
    "gap_down": {
        "label": "Gap Downs",
        "desc":  "Opened ≥ 1% below prior close",
        "icon":  "⬇️",
        "color": "#ff4d6d",
    },
    "strong_trend": {
        "label": "Strong Uptrend",
        "desc":  "Price > SMA20 > SMA50 > SMA200",
        "icon":  "📊",
        "color": "#3b82f6",
    },
    "golden_cross": {
        "label": "Golden Cross",
        "desc":  "SMA50 crossed above SMA200",
        "icon":  "✨",
        "color": "#fbbf24",
    },
}


# ── Pydantic models ───────────────────────────────────────────────
class ScreenerResult(BaseModel):
    symbol:            str
    name:              Optional[str] = None
    price:             Optional[float] = None
    change_pct:        Optional[float] = None
    volume:            Optional[float] = None
    volume_ratio:      Optional[float] = None
    rsi_14:            Optional[float] = None
    sma_20:            Optional[float] = None
    sma_50:            Optional[float] = None
    sma_200:           Optional[float] = None
    trend_signal:      str = "neutral"
    rsi_signal:        str = "neutral"
    ma_cross:          str = "none"
    volume_signal:     str = "normal"
    overall:           str = "hold"
    pct_from_52w_high: Optional[float] = None
    match_reason:      str = ""
    data_source:       str = "db"


class ScreenerResponse(BaseModel):
    preset:   str
    label:    str
    desc:     str
    icon:     str
    color:    str
    results:  list[ScreenerResult]
    universe: int
    matched:  int


# ── Pure-Python TA helpers (self-contained, no import from technical.py) ──

def _sma(closes: list[float], period: int) -> Optional[float]:
    if len(closes) < period:
        return None
    return round(sum(closes[-period:]) / period, 4)


def _ema(closes: list[float], period: int) -> Optional[float]:
    if len(closes) < period:
        return None
    k = 2 / (period + 1)
    val = sum(closes[:period]) / period
    for p in closes[period:]:
        val = p * k + val * (1 - k)
    return round(val, 4)


def _rsi(closes: list[float], period: int = 14) -> Optional[float]:
    if len(closes) < period + 1:
        return None
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains  = [max(d, 0) for d in deltas]
    losses = [max(-d, 0) for d in deltas]
    ag = sum(gains[:period]) / period
    al = sum(losses[:period]) / period
    for i in range(period, len(gains)):
        ag = (ag * (period - 1) + gains[i]) / period
        al = (al * (period - 1) + losses[i]) / period
    if al == 0:
        return 100.0
    return round(100 - 100 / (1 + ag / al), 2)


def _macd_hist(closes: list[float]) -> Optional[float]:
    if len(closes) < 35:
        return None
    ema12 = _ema(closes, 12)
    ema26 = _ema(closes, 26)
    if ema12 is None or ema26 is None:
        return None
    macd_line = ema12 - ema26
    macd_series = []
    k12 = 2 / 13; k26 = 2 / 27
    e12 = sum(closes[:12]) / 12; e26 = sum(closes[:26]) / 26
    for p in closes[12:]:
        e12 = p * k12 + e12 * (1 - k12)
    for p in closes[26:]:
        e26 = p * k26 + e26 * (1 - k26)
        macd_series.append(e12 - e26)
    if len(macd_series) < 9:
        return None
    sig = sum(macd_series[-9:]) / 9
    k_sig = 2 / 10
    for m in macd_series[-8:]:
        sig = m * k_sig + sig * (1 - k_sig)
    return round(macd_line - sig, 4)


def _overall_signal(
    rsi_sig: str, trend_sig: str, macd_hist: Optional[float],
    vol_sig: str, ma_cross: str, bb_pct: Optional[float] = None,
) -> str:
    score = 0
    if rsi_sig == "oversold":    score += 3
    if rsi_sig == "overbought":  score -= 3
    if trend_sig == "bullish":   score += 2
    if trend_sig == "bearish":   score -= 2
    if macd_hist is not None:
        score += 1 if macd_hist > 0 else -1
    if vol_sig == "high":
        score += 1 if trend_sig == "bullish" else (-1 if trend_sig == "bearish" else 0)
    if ma_cross == "golden_cross": score += 2
    if ma_cross == "death_cross":  score -= 2
    if bb_pct is not None:
        if bb_pct <= 0.1: score += 1
        if bb_pct >= 0.9: score -= 1
    if score >= 5:  return "strong_buy"
    if score >= 2:  return "buy"
    if score <= -5: return "strong_sell"
    if score <= -2: return "sell"
    return "hold"


def _apply_preset(data: dict, preset: str) -> Optional[str]:
    """Return human-readable reason if this stock matches the preset."""
    pct    = data.get("change_pct")
    vol_r  = data.get("volume_ratio")
    rsi    = data.get("rsi_14")
    sma20  = data.get("sma_20")
    sma50  = data.get("sma_50")
    sma200 = data.get("sma_200")
    price  = data.get("price")
    hi_pct = data.get("pct_from_52w_high")
    cross  = data.get("ma_cross", "none")

    if preset == "momentum_breakout":
        if pct is not None and pct >= 2.0:
            if vol_r is not None and vol_r >= 1.5:
                return f"+{pct:.1f}% · Vol {vol_r:.1f}×"
            return f"+{pct:.1f}%"

    elif preset == "oversold_bounce":
        if rsi is not None and rsi <= 35:
            above200 = sma200 is not None and price is not None and price > sma200
            suffix = " · Above SMA200" if above200 else ""
            return f"RSI {rsi:.0f}{suffix}"

    elif preset == "near_52w_high":
        if hi_pct is not None and hi_pct >= -2.0:
            return f"{hi_pct:.1f}% from 52W high"

    elif preset == "volume_surge":
        if vol_r is not None and vol_r >= 2.5:
            sign = "+" if (pct or 0) >= 0 else ""
            return f"Vol {vol_r:.1f}× · {sign}{(pct or 0):.1f}%"

    elif preset == "gap_up":
        if pct is not None and pct >= 1.0:
            return f"Gap +{pct:.1f}%"

    elif preset == "gap_down":
        if pct is not None and pct <= -1.0:
            return f"Gap {pct:.1f}%"

    elif preset == "strong_trend":
        if (price and sma20 and sma50 and sma200 and
                price > sma20 and sma20 > sma50 and sma50 > sma200):
            gap = round(((price / sma200) - 1) * 100, 1)
            return f"P > SMA20 > SMA50 > SMA200 (+{gap}% above 200)"

    elif preset == "golden_cross":
        if cross == "golden_cross":
            spread = round(((sma50 / sma200) - 1) * 100, 1) if sma50 and sma200 else 0
            return f"SMA50 > SMA200 (+{spread}% spread)"

    return None


async def _compute_tech(db: AsyncSession, symbol: str, name: Optional[str]) -> Optional[dict]:
    """Compute full technical snapshot for a symbol using local price_data."""
    rows = await db.execute(text("""
        SELECT ts, open, high, low, close, volume
        FROM price_data
        WHERE symbol = :sym
        ORDER BY ts DESC
        LIMIT 260
    """), {"sym": symbol})
    raw = [dict(r._mapping) for r in rows]
    if len(raw) < 5:
        return None

    rows_asc = list(reversed(raw))
    closes  = [float(r["close"])  for r in rows_asc if r["close"]  is not None]
    volumes = [float(r["volume"]) for r in rows_asc if r["volume"] is not None and r["volume"] > 0]
    highs   = [float(r["high"])   for r in rows_asc if r["high"]   is not None]
    lows    = [float(r["low"])    for r in rows_asc if r["low"]    is not None]

    if not closes:
        return None

    price  = closes[-1]
    rsi    = _rsi(closes)
    sma20  = _sma(closes, 20)
    sma50  = _sma(closes, 50)
    sma200 = _sma(closes, 200)
    mh     = _macd_hist(closes)

    hi52 = max(highs[-252:]) if highs else None
    lo52 = min(lows[-252:])  if lows  else None
    pct_from_high = round(((price - hi52) / hi52) * 100, 2) if hi52 else None

    avg_vol = _sma(volumes, 20)
    last_v  = volumes[-1] if volumes else None
    vol_r   = round(last_v / avg_vol, 2) if avg_vol and last_v else None

    chg_pct = None
    if len(closes) >= 2:
        chg_pct = round(((closes[-1] - closes[-2]) / closes[-2]) * 100, 2)

    # Classify
    rsi_sig  = "oversold" if (rsi or 50) <= 30 else ("overbought" if (rsi or 50) >= 70 else "neutral")
    above20  = sma20  is not None and price > sma20
    above50  = sma50  is not None and price > sma50
    trend    = "bullish" if (above20 and above50) else ("bearish" if (not above20 and not above50) else "neutral")

    if sma50 and sma200:
        if sma50 > sma200 * 1.01:  ma_cross = "golden_cross"
        elif sma50 < sma200 * 0.99: ma_cross = "death_cross"
        else:                        ma_cross = "none"
    else:
        ma_cross = "none"

    vol_sig = "high" if (vol_r and vol_r >= 2) else ("low" if (vol_r and vol_r <= 0.5) else "normal")
    overall = _overall_signal(rsi_sig, trend, mh, vol_sig, ma_cross)

    return {
        "symbol":            symbol,
        "name":              name,
        "price":             round(price, 2),
        "change_pct":        chg_pct,
        "volume":            last_v,
        "volume_ratio":      vol_r,
        "rsi_14":            rsi,
        "sma_20":            sma20,
        "sma_50":            sma50,
        "sma_200":           sma200,
        "trend_signal":      trend,
        "rsi_signal":        rsi_sig,
        "ma_cross":          ma_cross,
        "volume_signal":     vol_sig,
        "overall":           overall,
        "pct_from_52w_high": pct_from_high,
        "match_reason":      "",
        "data_source":       "db",
    }


# ── Endpoints ─────────────────────────────────────────────────────

@router.get("/presets")
async def list_presets():
    """List all available preset scans with metadata."""
    return [{"id": k, **v} for k, v in PRESET_DEFINITIONS.items()]


@router.get("/run", response_model=ScreenerResponse)
async def run_screener(
    preset: str          = Query("momentum_breakout"),
    region: Optional[str]= Query(None, description="india | us | all"),
    db: AsyncSession     = Depends(get_db),
    redis                = Depends(get_redis),
):
    """
    Run a preset screen against the full universe.
    Results cached for 5 minutes (price data changes are minor between refreshes).
    """
    cache_key = f"screener:{preset}:{region or 'all'}"
    cached = await redis.get(cache_key)
    if cached:
        return ScreenerResponse(**json.loads(cached))

    info = PRESET_DEFINITIONS.get(preset, PRESET_DEFINITIONS["momentum_breakout"])

    # Select symbol universe
    if region == "india":
        universe = NIFTY50
    elif region == "us":
        universe = US_STOCKS
    else:
        universe = FULL_UNIVERSE

    # Find which symbols have enough price history
    res = await db.execute(text("""
        SELECT symbol, COUNT(*) as cnt
        FROM price_data
        WHERE symbol = ANY(:syms)
        GROUP BY symbol
        HAVING COUNT(*) >= 10
    """), {"syms": universe})
    available = {r.symbol for r in res.fetchall()}

    # Get names: watchlist first (most up-to-date), then indices
    name_res = await db.execute(text("""
        SELECT symbol, name FROM watchlist WHERE symbol = ANY(:syms) AND name IS NOT NULL
        UNION ALL
        SELECT i.symbol, i.name FROM indices i
        WHERE i.symbol = ANY(:syms) AND i.name IS NOT NULL
          AND i.symbol NOT IN (SELECT symbol FROM watchlist WHERE symbol = ANY(:syms) AND name IS NOT NULL)
    """), {"syms": list(available)})
    names = {r.symbol: r.name for r in name_res.fetchall()}

    # If no data at all, try a quick live fetch for change_pct only
    if not available:
        try:
            live = await ingestion.fetch_yahoo_quotes(universe[:30])
        except Exception:
            live = []
        results_live = []
        for q in live:
            sym = q.get("symbol", "")
            data = {
                "symbol": sym, "name": q.get("name"), "price": q.get("price"),
                "change_pct": q.get("change_pct"), "volume": q.get("volume"),
                "volume_ratio": None, "rsi_14": None, "sma_20": None,
                "sma_50": None, "sma_200": None, "trend_signal": "neutral",
                "rsi_signal": "neutral", "ma_cross": "none", "volume_signal": "normal",
                "overall": "hold", "pct_from_52w_high": None, "match_reason": "",
                "data_source": "live",
            }
            reason = _apply_preset(data, preset)
            if reason:
                data["match_reason"] = reason
                results_live.append(ScreenerResult(**data))
        results_live.sort(key=lambda r: abs(r.change_pct or 0), reverse=True)
        resp = ScreenerResponse(
            preset=preset, label=info["label"], desc=info["desc"],
            icon=info["icon"], color=info["color"],
            results=results_live, universe=len(live), matched=len(results_live),
        )
        await redis.setex(cache_key, 180, resp.model_dump_json())
        return resp

    # Compute technical signals for all available symbols
    results: list[ScreenerResult] = []
    for sym in universe:
        if sym not in available:
            continue
        try:
            tech = await _compute_tech(db, sym, names.get(sym))
            if not tech:
                continue
            reason = _apply_preset(tech, preset)
            if reason:
                tech["match_reason"] = reason
                results.append(ScreenerResult(**tech))
        except Exception as e:
            logger.warning("Screener error for %s: %s", sym, e)

    # Sort results by relevance
    sort_key = {
        "momentum_breakout": lambda r: r.change_pct or 0,
        "oversold_bounce":   lambda r: r.rsi_14 or 100,
        "near_52w_high":     lambda r: r.pct_from_52w_high or -999,
        "volume_surge":      lambda r: r.volume_ratio or 0,
        "gap_up":            lambda r: r.change_pct or 0,
        "gap_down":          lambda r: -(r.change_pct or 0),
        "strong_trend":      lambda r: r.change_pct or 0,
        "golden_cross":      lambda r: r.change_pct or 0,
    }.get(preset, lambda r: r.change_pct or 0)

    reverse = preset not in ("oversold_bounce",)
    results.sort(key=sort_key, reverse=reverse)

    resp = ScreenerResponse(
        preset=preset, label=info["label"], desc=info["desc"],
        icon=info["icon"], color=info["color"],
        results=results[:50], universe=len(available), matched=len(results),
    )
    await redis.setex(cache_key, 300, resp.model_dump_json())
    return resp


class OpportunityItem(BaseModel):
    symbol:          str
    name:            Optional[str] = None
    region:          str = "global"
    price:           Optional[float] = None
    change_pct:      Optional[float] = None
    volume_ratio:    Optional[float] = None
    rsi_14:          Optional[float] = None
    overall:         str = "hold"
    trend_signal:    str = "neutral"
    ma_cross:        str = "none"
    pct_from_52w_high: Optional[float] = None
    opportunity_score: float = 0.0
    matched_presets: list[str] = []
    match_reasons:   list[str] = []
    preset_icons:    list[str] = []
    primary_preset:  str = ""
    primary_color:   str = "#7c3aed"
    data_source:     str = "db"


class OpportunitiesResponse(BaseModel):
    opportunities: list[OpportunityItem]
    universe:      int
    total_matched: int
    presets_run:   int
    as_of:         str


def _opportunity_score(item: dict, matched_presets: list[str]) -> float:
    """Compute a 0–100 opportunity score from technical signals and preset matches."""
    score = 0.0

    # Signal strength
    signal_scores = {
        "strong_buy":  35.0, "buy": 20.0, "hold": 5.0,
        "sell": -10.0, "strong_sell": -20.0,
    }
    score += signal_scores.get(item.get("overall", "hold"), 0)

    # RSI contribution
    rsi = item.get("rsi_14")
    if rsi is not None:
        if rsi <= 25:   score += 15
        elif rsi <= 35: score += 10
        elif rsi >= 75: score -= 10
        elif rsi >= 65: score -= 5

    # Trend
    trend = item.get("trend_signal", "neutral")
    if trend == "bullish":  score += 10
    elif trend == "bearish": score -= 5

    # MA cross
    cross = item.get("ma_cross", "none")
    if cross == "golden_cross": score += 12
    elif cross == "death_cross": score -= 8

    # Volume surge bonus
    vol_r = item.get("volume_ratio")
    if vol_r:
        if vol_r >= 3.0: score += 12
        elif vol_r >= 2.0: score += 7
        elif vol_r >= 1.5: score += 3

    # Momentum
    chg = item.get("change_pct", 0) or 0
    if chg >= 3.0:   score += 8
    elif chg >= 1.5: score += 4
    elif chg <= -3.0: score -= 4

    # Nearness to 52W high
    pct_high = item.get("pct_from_52w_high")
    if pct_high is not None:
        if pct_high >= -1.0: score += 8   # new 52W high territory
        elif pct_high >= -5.0: score += 4

    # Bonus for multi-preset matches
    score += len(matched_presets) * 4

    # Normalize to 0-100
    return round(min(100.0, max(0.0, score + 30)), 1)


@router.get("/opportunities", response_model=OpportunitiesResponse)
async def get_opportunities(
    region: Optional[str] = Query(None, description="india | us | all"),
    min_score: float       = Query(30.0, description="Minimum opportunity score 0-100"),
    limit: int             = Query(40, description="Max opportunities to return"),
    db: AsyncSession       = Depends(get_db),
    redis                  = Depends(get_redis),
):
    """
    Aggregate ALL screener presets and return a ranked list of investment/trading
    opportunities with composite opportunity scores. Cached 5 min.
    """
    from datetime import datetime, timezone

    cache_key = f"opportunities:{region or 'all'}:{min_score}:{limit}"
    cached = await redis.get(cache_key)
    if cached:
        return OpportunitiesResponse(**json.loads(cached))

    # Determine universe
    if region == "india":
        universe = NIFTY50
    elif region == "us":
        universe = US_STOCKS
    else:
        universe = FULL_UNIVERSE

    # Find symbols with enough price history
    res = await db.execute(text("""
        SELECT symbol, COUNT(*) as cnt
        FROM price_data
        WHERE symbol = ANY(:syms)
        GROUP BY symbol
        HAVING COUNT(*) >= 10
    """), {"syms": universe})
    available = {r.symbol for r in res.fetchall()}

    # Get names
    name_res = await db.execute(text("""
        SELECT symbol, name FROM watchlist WHERE symbol = ANY(:syms) AND name IS NOT NULL
        UNION ALL
        SELECT i.symbol, i.name FROM indices i
        WHERE i.symbol = ANY(:syms) AND i.name IS NOT NULL
          AND i.symbol NOT IN (SELECT symbol FROM watchlist WHERE symbol = ANY(:syms) AND name IS NOT NULL)
    """), {"syms": list(available)})
    names = {r.symbol: r.name for r in name_res.fetchall()}

    # Compute technicals for all available symbols once
    tech_map: dict[str, dict] = {}
    for sym in universe:
        if sym not in available:
            continue
        try:
            tech = await _compute_tech(db, sym, names.get(sym))
            if tech:
                tech_map[sym] = tech
        except Exception as e:
            logger.warning("Opportunity tech error for %s: %s", sym, e)

    # Run all presets and collect matches per symbol
    ALL_PRESETS = list(PRESET_DEFINITIONS.keys())
    symbol_matches: dict[str, dict] = {}

    for preset_id in ALL_PRESETS:
        info = PRESET_DEFINITIONS[preset_id]
        for sym, tech in tech_map.items():
            reason = _apply_preset(tech, preset_id)
            if reason:
                if sym not in symbol_matches:
                    symbol_matches[sym] = {
                        **tech,
                        "matched_presets": [],
                        "match_reasons": [],
                        "preset_icons": [],
                    }
                symbol_matches[sym]["matched_presets"].append(preset_id)
                symbol_matches[sym]["match_reasons"].append(reason)
                symbol_matches[sym]["preset_icons"].append(info["icon"])

    # Build opportunity items with scores
    region_map = {s: "india" for s in NIFTY50}
    region_map.update({s: "us" for s in US_STOCKS})

    opportunities: list[OpportunityItem] = []
    for sym, data in symbol_matches.items():
        matched = data["matched_presets"]
        score = _opportunity_score(data, matched)
        if score < min_score:
            continue

        # Primary preset: prefer strong signals; pick first one otherwise
        priority_order = [
            "golden_cross", "strong_trend", "momentum_breakout",
            "oversold_bounce", "near_52w_high", "volume_surge", "gap_up", "gap_down",
        ]
        primary = next((p for p in priority_order if p in matched), matched[0] if matched else "")
        primary_info = PRESET_DEFINITIONS.get(primary, {})

        opportunities.append(OpportunityItem(
            symbol=sym,
            name=data.get("name"),
            region=region_map.get(sym, "global"),
            price=data.get("price"),
            change_pct=data.get("change_pct"),
            volume_ratio=data.get("volume_ratio"),
            rsi_14=data.get("rsi_14"),
            overall=data.get("overall", "hold"),
            trend_signal=data.get("trend_signal", "neutral"),
            ma_cross=data.get("ma_cross", "none"),
            pct_from_52w_high=data.get("pct_from_52w_high"),
            opportunity_score=score,
            matched_presets=matched,
            match_reasons=data["match_reasons"],
            preset_icons=data["preset_icons"],
            primary_preset=primary_info.get("label", primary),
            primary_color=primary_info.get("color", "#7c3aed"),
            data_source=data.get("data_source", "db"),
        ))

    opportunities.sort(key=lambda o: o.opportunity_score, reverse=True)

    resp = OpportunitiesResponse(
        opportunities=opportunities[:limit],
        universe=len(available),
        total_matched=len(opportunities),
        presets_run=len(ALL_PRESETS),
        as_of=datetime.now(timezone.utc).isoformat(),
    )
    await redis.setex(cache_key, 300, resp.model_dump_json())
    return resp


@router.post("/seed-universe")
async def seed_universe(
    region: Optional[str] = Query(None, description="india | us | all"),
    db: AsyncSession = Depends(get_db),
    redis            = Depends(get_redis),
):
    """
    Seed price history for the screener universe by fetching 6-month daily bars
    from Yahoo Finance. Run this once to populate data for Nifty 50 + US stocks.
    Safe to call repeatedly (ON CONFLICT DO NOTHING).
    """
    import httpx
    from datetime import date

    if region == "india":
        symbols = NIFTY50
    elif region == "us":
        symbols = US_STOCKS
    else:
        symbols = FULL_UNIVERSE

    # Skip symbols that already have >= 60 days of data
    existing = await db.execute(text("""
        SELECT symbol FROM (
            SELECT symbol, COUNT(*) as cnt FROM price_data
            WHERE symbol = ANY(:syms) GROUP BY symbol
        ) sub WHERE cnt >= 60
    """), {"syms": symbols})
    skip = {r.symbol for r in existing.fetchall()}
    to_fetch = [s for s in symbols if s not in skip]

    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        "Accept": "application/json",
    }
    inserted_total = 0
    errors = []

    async with httpx.AsyncClient(timeout=25, headers=headers, follow_redirects=True) as client:
        for symbol in to_fetch:
            try:
                r = await client.get(
                    f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
                    params={"range": "6mo", "interval": "1d"},
                )
                if r.status_code != 200:
                    errors.append(f"{symbol}: HTTP {r.status_code}")
                    continue
                data = r.json()
                result = data.get("chart", {}).get("result", [])
                if not result:
                    errors.append(f"{symbol}: no data")
                    continue
                result = result[0]
                timestamps = result.get("timestamp", [])
                quote = result.get("indicators", {}).get("quote", [{}])[0]
                opens   = quote.get("open", [])
                highs   = quote.get("high", [])
                lows    = quote.get("low", [])
                closes  = quote.get("close", [])
                volumes = quote.get("volume", [])

                meta = result.get("meta", {})

                # Store name in watchlist if not already there (so screener can show names)
                sym_name = meta.get("longName") or meta.get("shortName") or symbol
                try:
                    await db.execute(text("""
                        INSERT INTO watchlist (symbol, name, is_active)
                        VALUES (:sym, :name, false)
                        ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name
                    """), {"sym": symbol, "name": sym_name[:120]})
                except Exception:
                    await db.rollback()

                inserted = 0
                for i, ts in enumerate(timestamps):
                    if i >= len(closes) or closes[i] is None:
                        continue
                    dt = date.fromtimestamp(ts)
                    await db.execute(text("""
                        INSERT INTO price_data (symbol, ts, open, high, low, close, volume)
                        VALUES (:sym, :ts, :o, :h, :l, :c, :v)
                        ON CONFLICT (symbol, ts) DO NOTHING
                    """), {
                        "sym": symbol,
                        "ts":  dt,
                        "o":   opens[i]   if i < len(opens)   else None,
                        "h":   highs[i]   if i < len(highs)   else None,
                        "l":   lows[i]    if i < len(lows)    else None,
                        "c":   closes[i],
                        "v":   int(volumes[i]) if i < len(volumes) and volumes[i] else None,
                    })
                    inserted += 1
                await db.commit()
                inserted_total += inserted
                logger.info("Seeded %s: %d rows", symbol, inserted)
                await asyncio.sleep(0.25)

            except Exception as e:
                errors.append(f"{symbol}: {e}")
                logger.warning("Seed error for %s: %s", symbol, e)

    # Bust screener cache
    async for key in redis.scan_iter("screener:*"):
        await redis.delete(key)

    return {
        "status": "ok",
        "seeded": len(to_fetch),
        "skipped": len(skip),
        "rows_inserted": inserted_total,
        "errors": errors[:20],
    }
