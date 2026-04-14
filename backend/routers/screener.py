"""
Stock Screener & Opportunities Router
Purpose-built to surface investment and trading opportunities from deep
multi-signal analysis across global markets (Nifty 50 + top US stocks).

Signals computed per symbol:
  - RSI-14 (oversold/overbought)
  - SMA 20/50/200 (trend, golden/death cross)
  - MACD (12/26/9 - histogram, crossover)
  - Bollinger Bands (20,2) - squeeze detection
  - ATR-14 (volatility, stop/target suggestions)
  - Volume ratio vs 20-day average
  - 52-week high/low proximity
  - Price momentum (1D)

Each opportunity gets:
  - Composite score 0-100
  - Opportunity type (BREAKOUT/REVERSAL/TREND/GOLDEN_CROSS/VOLUME/SQUEEZE)
  - Time horizon (INTRADAY/SWING/POSITIONAL)
  - Confidence (HIGH/MEDIUM/LOW)
  - Suggested entry, stop loss, target price
  - Sparkline data (last 20 closes, normalized)
  - Risk/Reward ratio
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
        "label": "Momentum Breakout", "desc": "1D gain ≥ 2%, volume ≥ 1.5× average",
        "icon": "🚀", "color": "#00d68f", "type": "BREAKOUT",
    },
    "oversold_bounce": {
        "label": "Oversold Bounce", "desc": "RSI ≤ 35, price above 200 SMA",
        "icon": "📈", "color": "#4ade80", "type": "REVERSAL",
    },
    "near_52w_high": {
        "label": "52-Week High", "desc": "Within 2% of 52-week high",
        "icon": "🏔️", "color": "#a78bfa", "type": "BREAKOUT",
    },
    "volume_surge": {
        "label": "Volume Surge", "desc": "Volume ≥ 2.5× 20-day average",
        "icon": "⚡", "color": "#f59e0b", "type": "VOLUME",
    },
    "gap_up": {
        "label": "Gap Up", "desc": "Opened ≥ 1% above prior close",
        "icon": "⬆️", "color": "#00d68f", "type": "BREAKOUT",
    },
    "gap_down": {
        "label": "Gap Down", "desc": "Opened ≥ 1% below prior close",
        "icon": "⬇️", "color": "#ff4d6d", "type": "REVERSAL",
    },
    "strong_trend": {
        "label": "Strong Uptrend", "desc": "Price > SMA20 > SMA50 > SMA200",
        "icon": "📊", "color": "#3b82f6", "type": "TREND",
    },
    "golden_cross": {
        "label": "Golden Cross", "desc": "SMA50 crossed above SMA200",
        "icon": "✨", "color": "#fbbf24", "type": "GOLDEN_CROSS",
    },
}


# ═══════════════════════════════════════════════════════════════════
#  TECHNICAL ANALYSIS — self-contained helpers
# ═══════════════════════════════════════════════════════════════════

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


def _macd(closes: list[float]) -> tuple[Optional[float], Optional[float], Optional[float]]:
    """Returns (macd_line, signal_line, histogram)."""
    if len(closes) < 35:
        return None, None, None
    k12, k26, k9 = 2/13, 2/27, 2/10
    e12 = sum(closes[:12]) / 12
    for c in closes[12:]:
        e12 = c * k12 + e12 * (1 - k12)
    e26 = sum(closes[:26]) / 26
    macd_series = []
    curr_e12 = sum(closes[:12]) / 12
    curr_e26 = sum(closes[:26]) / 26
    for c in closes[12:]:
        curr_e12 = c * k12 + curr_e12 * (1 - k12)
    for i, c in enumerate(closes[26:]):
        curr_e26 = c * k26 + curr_e26 * (1 - k26)
        macd_series.append(curr_e12 - curr_e26)
    if len(macd_series) < 9:
        return None, None, None
    sig = sum(macd_series[:9]) / 9
    for m in macd_series[9:]:
        sig = m * k9 + sig * (1 - k9)
    macd_line = macd_series[-1] if macd_series else None
    hist = round(macd_line - sig, 6) if macd_line is not None else None
    return round(macd_line, 6) if macd_line else None, round(sig, 6), hist


def _bollinger(closes: list[float], period: int = 20) -> tuple[Optional[float], Optional[float], Optional[float], Optional[float]]:
    """Returns (upper, middle, lower, bb_pct)."""
    if len(closes) < period:
        return None, None, None, None
    mid = sum(closes[-period:]) / period
    variance = sum((c - mid) ** 2 for c in closes[-period:]) / period
    std = variance ** 0.5
    upper = mid + 2 * std
    lower = mid - 2 * std
    price = closes[-1]
    bb_pct = (price - lower) / (upper - lower) if (upper - lower) > 0 else 0.5
    return round(upper, 4), round(mid, 4), round(lower, 4), round(bb_pct, 4)


def _atr(highs: list[float], lows: list[float], closes: list[float], period: int = 14) -> Optional[float]:
    if len(highs) < period + 1:
        return None
    trs = []
    for i in range(1, len(highs)):
        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
        trs.append(tr)
    if len(trs) < period:
        return None
    atr = sum(trs[:period]) / period
    for tr in trs[period:]:
        atr = (atr * (period - 1) + tr) / period
    return round(atr, 4)


def _suggest_levels(price: float, atr: Optional[float], overall: str, trend: str) -> tuple[Optional[float], Optional[float], Optional[float], Optional[float]]:
    """Suggest entry, stop_loss, target, risk_reward."""
    if atr is None or atr <= 0 or price is None:
        return None, None, None, None
    entry = round(price, 2)
    if overall in ("strong_buy", "buy"):
        stop   = round(price - 2.0 * atr, 2)
        target = round(price + 3.0 * atr, 2)
    elif overall in ("strong_sell", "sell"):
        stop   = round(price + 2.0 * atr, 2)
        target = round(price - 3.0 * atr, 2)
    else:
        stop   = round(price - 1.5 * atr, 2)
        target = round(price + 2.0 * atr, 2)
    risk   = abs(entry - stop)
    reward = abs(target - entry)
    rr     = round(reward / risk, 2) if risk > 0 else None
    return entry, stop, target, rr


def _time_horizon(vol_r: Optional[float], rsi: Optional[float], ma_cross: str) -> str:
    if ma_cross == "golden_cross":
        return "POSITIONAL"
    if vol_r and vol_r >= 3.0 and rsi and (rsi <= 25 or rsi >= 75):
        return "INTRADAY"
    return "SWING"


def _confidence(score: float, matched_count: int) -> str:
    if score >= 70 or matched_count >= 4:
        return "HIGH"
    if score >= 50 or matched_count >= 2:
        return "MEDIUM"
    return "LOW"


def _opportunity_type(primary_preset: str, ma_cross: str, bb_pct: Optional[float]) -> str:
    if ma_cross == "golden_cross":
        return "GOLDEN_CROSS"
    if bb_pct is not None and 0.35 <= bb_pct <= 0.65 and primary_preset not in ("momentum_breakout", "gap_up"):
        return "SQUEEZE"
    type_map = {
        "momentum_breakout": "BREAKOUT",
        "near_52w_high":     "BREAKOUT",
        "gap_up":            "BREAKOUT",
        "oversold_bounce":   "REVERSAL",
        "gap_down":          "REVERSAL",
        "strong_trend":      "TREND",
        "volume_surge":      "VOLUME",
        "golden_cross":      "GOLDEN_CROSS",
    }
    return type_map.get(primary_preset, "SIGNAL")


def _overall_signal(rsi_sig: str, trend_sig: str, macd_hist: Optional[float], vol_sig: str, ma_cross: str, bb_pct: Optional[float] = None) -> str:
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


def _opportunity_score(data: dict, matched_presets: list[str]) -> float:
    score = 30.0  # base
    signal_map = {"strong_buy": 35, "buy": 20, "hold": 0, "sell": -10, "strong_sell": -20}
    score += signal_map.get(data.get("overall", "hold"), 0)
    rsi = data.get("rsi_14")
    if rsi is not None:
        if rsi <= 25:   score += 15
        elif rsi <= 35: score += 10
        elif rsi >= 75: score -= 10
        elif rsi >= 65: score -= 5
    trend = data.get("trend_signal", "neutral")
    if trend == "bullish":  score += 10
    elif trend == "bearish": score -= 5
    cross = data.get("ma_cross", "none")
    if cross == "golden_cross": score += 12
    elif cross == "death_cross": score -= 8
    vol_r = data.get("volume_ratio")
    if vol_r:
        if vol_r >= 3.0: score += 12
        elif vol_r >= 2.0: score += 7
        elif vol_r >= 1.5: score += 3
    chg = data.get("change_pct", 0) or 0
    if chg >= 3.0:   score += 8
    elif chg >= 1.5: score += 4
    elif chg <= -3.0: score -= 4
    pct_high = data.get("pct_from_52w_high")
    if pct_high is not None:
        if pct_high >= -1.0: score += 8
        elif pct_high >= -5.0: score += 4
    macd_h = data.get("macd_hist")
    if macd_h is not None:
        score += 3 if macd_h > 0 else -2
    bb_pct = data.get("bb_pct")
    if bb_pct is not None:
        if bb_pct <= 0.15: score += 5  # near lower band = potential bounce
        if bb_pct >= 0.85: score -= 3  # near upper band = overbought
    atr = data.get("atr_14")
    rr = data.get("risk_reward")
    if rr and rr >= 2.0: score += 4
    score += len(matched_presets) * 4
    return round(min(100.0, max(0.0, score)), 1)


def _apply_preset(data: dict, preset: str) -> Optional[str]:
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
            return f"RSI {rsi:.0f}" + (" · Above SMA200" if above200 else "")
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
            return f"P > SMA20 > SMA50 > SMA200 (+{gap}%)"
    elif preset == "golden_cross":
        if cross == "golden_cross":
            spread = round(((sma50 / sma200) - 1) * 100, 1) if sma50 and sma200 else 0
            return f"SMA50 > SMA200 (+{spread}% spread)"
    return None


async def _compute_tech(db: AsyncSession, symbol: str, name: Optional[str]) -> Optional[dict]:
    """Full technical snapshot with Bollinger, ATR, MACD, sparkline."""
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
    macd_line, macd_sig, macd_hist = _macd(closes)
    bb_upper, bb_mid, bb_lower, bb_pct = _bollinger(closes)
    atr    = _atr(highs, lows, closes)

    hi52 = max(highs[-252:]) if len(highs) >= 5 else None
    lo52 = min(lows[-252:])  if len(lows)  >= 5 else None
    pct_from_high = round(((price - hi52) / hi52) * 100, 2) if hi52 else None
    pct_from_low  = round(((price - lo52) / lo52) * 100, 2) if lo52 else None

    avg_vol = _sma(volumes, 20)
    last_v  = volumes[-1] if volumes else None
    vol_r   = round(last_v / avg_vol, 2) if avg_vol and last_v else None

    chg_pct = None
    if len(closes) >= 2:
        chg_pct = round(((closes[-1] - closes[-2]) / closes[-2]) * 100, 2)

    rsi_sig  = "oversold" if (rsi or 50) <= 30 else ("overbought" if (rsi or 50) >= 70 else "neutral")
    above20  = sma20  is not None and price > sma20
    above50  = sma50  is not None and price > sma50
    trend    = "bullish" if (above20 and above50) else ("bearish" if (not above20 and not above50) else "neutral")

    if sma50 and sma200:
        if sma50 > sma200 * 1.01:   ma_cross = "golden_cross"
        elif sma50 < sma200 * 0.99: ma_cross = "death_cross"
        else:                        ma_cross = "none"
    else:
        ma_cross = "none"

    vol_sig = "high" if (vol_r and vol_r >= 2) else ("low" if (vol_r and vol_r <= 0.5) else "normal")
    overall = _overall_signal(rsi_sig, trend, macd_hist, vol_sig, ma_cross, bb_pct)

    entry, stop, target, rr = _suggest_levels(price, atr, overall, trend)

    # Sparkline: last 20 closes, normalized 0-1
    spark_raw = closes[-20:]
    sp_min = min(spark_raw)
    sp_max = max(spark_raw)
    sp_rng = sp_max - sp_min
    sparkline = [round((c - sp_min) / sp_rng, 4) if sp_rng > 0 else 0.5 for c in spark_raw]

    # BB squeeze: bandwidth < 5% of middle band
    bb_squeeze = False
    if bb_upper and bb_lower and bb_mid and bb_mid > 0:
        bandwidth = (bb_upper - bb_lower) / bb_mid
        bb_squeeze = bandwidth < 0.05

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
        "macd_line":         macd_line,
        "macd_signal":       macd_sig,
        "macd_hist":         macd_hist,
        "bb_upper":          bb_upper,
        "bb_lower":          bb_lower,
        "bb_pct":            bb_pct,
        "bb_squeeze":        bb_squeeze,
        "atr_14":            atr,
        "week_52_high":      round(hi52, 2) if hi52 else None,
        "week_52_low":       round(lo52, 2) if lo52 else None,
        "pct_from_52w_high": pct_from_high,
        "pct_from_52w_low":  pct_from_low,
        "trend_signal":      trend,
        "rsi_signal":        rsi_sig,
        "ma_cross":          ma_cross,
        "volume_signal":     vol_sig,
        "overall":           overall,
        "entry_price":       entry,
        "stop_loss":         stop,
        "target_price":      target,
        "risk_reward":       rr,
        "sparkline":         sparkline,
        "bb_squeeze":        bb_squeeze,
        "match_reason":      "",
        "data_source":       "db",
    }


# ═══════════════════════════════════════════════════════════════════
#  PYDANTIC MODELS
# ═══════════════════════════════════════════════════════════════════

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


class OpportunityItem(BaseModel):
    symbol:            str
    name:              Optional[str] = None
    region:            str = "global"
    price:             Optional[float] = None
    change_pct:        Optional[float] = None
    volume_ratio:      Optional[float] = None
    rsi_14:            Optional[float] = None
    macd_hist:         Optional[float] = None
    bb_pct:            Optional[float] = None
    bb_squeeze:        bool = False
    atr_14:            Optional[float] = None
    week_52_high:      Optional[float] = None
    week_52_low:       Optional[float] = None
    pct_from_52w_high: Optional[float] = None
    overall:           str = "hold"
    trend_signal:      str = "neutral"
    ma_cross:          str = "none"
    entry_price:       Optional[float] = None
    stop_loss:         Optional[float] = None
    target_price:      Optional[float] = None
    risk_reward:       Optional[float] = None
    sparkline:         list[float] = []
    opportunity_score: float = 0.0
    opportunity_type:  str = "SIGNAL"
    time_horizon:      str = "SWING"
    confidence:        str = "MEDIUM"
    matched_presets:   list[str] = []
    match_reasons:     list[str] = []
    preset_icons:      list[str] = []
    primary_preset:    str = ""
    primary_color:     str = "#7c3aed"
    why:               str = ""
    data_source:       str = "db"


class OpportunitiesResponse(BaseModel):
    opportunities: list[OpportunityItem]
    universe:      int
    total_matched: int
    presets_run:   int
    high_conf:     int
    breakouts:     int
    reversals:     int
    as_of:         str


# ═══════════════════════════════════════════════════════════════════
#  ENDPOINTS
# ═══════════════════════════════════════════════════════════════════

@router.get("/presets")
async def list_presets():
    return [{"id": k, **v} for k, v in PRESET_DEFINITIONS.items()]


@router.get("/run", response_model=ScreenerResponse)
async def run_screener(
    preset: str           = Query("momentum_breakout"),
    region: Optional[str] = Query(None, description="india | us | all"),
    db: AsyncSession      = Depends(get_db),
    redis                 = Depends(get_redis),
):
    cache_key = f"screener:{preset}:{region or 'all'}"
    cached = await redis.get(cache_key)
    if cached:
        return ScreenerResponse(**json.loads(cached))

    info = PRESET_DEFINITIONS.get(preset, PRESET_DEFINITIONS["momentum_breakout"])
    universe = NIFTY50 if region == "india" else US_STOCKS if region == "us" else FULL_UNIVERSE

    res = await db.execute(text("""
        SELECT symbol, COUNT(*) as cnt FROM price_data
        WHERE symbol = ANY(:syms) GROUP BY symbol HAVING COUNT(*) >= 10
    """), {"syms": universe})
    available = {r.symbol for r in res.fetchall()}

    name_res = await db.execute(text("""
        SELECT symbol, name FROM watchlist WHERE symbol = ANY(:syms) AND name IS NOT NULL
        UNION ALL
        SELECT i.symbol, i.name FROM indices i
        WHERE i.symbol = ANY(:syms) AND i.name IS NOT NULL
          AND i.symbol NOT IN (SELECT symbol FROM watchlist WHERE symbol = ANY(:syms) AND name IS NOT NULL)
    """), {"syms": list(available)})
    names = {r.symbol: r.name for r in name_res.fetchall()}

    if not available:
        resp = ScreenerResponse(preset=preset, label=info["label"], desc=info["desc"],
                                icon=info["icon"], color=info["color"], results=[], universe=0, matched=0)
        await redis.setex(cache_key, 120, resp.model_dump_json())
        return resp

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
                results.append(ScreenerResult(**{k: tech[k] for k in ScreenerResult.model_fields if k in tech}))
        except Exception as e:
            logger.warning("Screener error %s: %s", sym, e)

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

    results.sort(key=sort_key, reverse=preset not in ("oversold_bounce",))
    resp = ScreenerResponse(preset=preset, label=info["label"], desc=info["desc"],
                            icon=info["icon"], color=info["color"],
                            results=results[:50], universe=len(available), matched=len(results))
    await redis.setex(cache_key, 300, resp.model_dump_json())
    return resp


@router.get("/opportunities", response_model=OpportunitiesResponse)
async def get_opportunities(
    region:    Optional[str] = Query(None, description="india | us | all"),
    min_score: float          = Query(20.0),
    limit:     int            = Query(50),
    db: AsyncSession          = Depends(get_db),
    redis                     = Depends(get_redis),
):
    """
    Deep multi-signal scan across global markets. Returns ranked investment
    and trading opportunities with entry/stop/target levels and sparklines.
    """
    from datetime import datetime, timezone

    cache_key = f"opps_v2:{region or 'all'}:{min_score}:{limit}"
    cached = await redis.get(cache_key)
    if cached:
        return OpportunitiesResponse(**json.loads(cached))

    universe = NIFTY50 if region == "india" else US_STOCKS if region == "us" else FULL_UNIVERSE

    res = await db.execute(text("""
        SELECT symbol, COUNT(*) as cnt FROM price_data
        WHERE symbol = ANY(:syms) GROUP BY symbol HAVING COUNT(*) >= 10
    """), {"syms": universe})
    available = {r.symbol for r in res.fetchall()}

    name_res = await db.execute(text("""
        SELECT symbol, name FROM watchlist WHERE symbol = ANY(:syms) AND name IS NOT NULL
        UNION ALL
        SELECT i.symbol, i.name FROM indices i
        WHERE i.symbol = ANY(:syms) AND i.name IS NOT NULL
          AND i.symbol NOT IN (SELECT symbol FROM watchlist WHERE symbol = ANY(:syms) AND name IS NOT NULL)
    """), {"syms": list(available)})
    names = {r.symbol: r.name for r in name_res.fetchall()}

    # Full technical analysis for all available symbols
    tech_map: dict[str, dict] = {}
    for sym in universe:
        if sym not in available:
            continue
        try:
            tech = await _compute_tech(db, sym, names.get(sym))
            if tech:
                tech_map[sym] = tech
        except Exception as e:
            logger.warning("Opp tech error %s: %s", sym, e)

    # Match all presets
    symbol_matches: dict[str, dict] = {}
    for preset_id in PRESET_DEFINITIONS:
        pinfo = PRESET_DEFINITIONS[preset_id]
        for sym, tech in tech_map.items():
            reason = _apply_preset(tech, preset_id)
            if reason:
                if sym not in symbol_matches:
                    symbol_matches[sym] = {**tech, "matched_presets": [], "match_reasons": [], "preset_icons": []}
                symbol_matches[sym]["matched_presets"].append(preset_id)
                symbol_matches[sym]["match_reasons"].append(reason)
                symbol_matches[sym]["preset_icons"].append(pinfo["icon"])

    region_map = {s: "india" for s in NIFTY50}
    region_map.update({s: "us" for s in US_STOCKS})

    priority = ["golden_cross", "strong_trend", "momentum_breakout", "oversold_bounce",
                 "near_52w_high", "volume_surge", "gap_up", "gap_down"]

    opportunities: list[OpportunityItem] = []
    for sym, data in symbol_matches.items():
        matched = data["matched_presets"]
        score = _opportunity_score(data, matched)
        if score < min_score:
            continue
        primary = next((p for p in priority if p in matched), matched[0] if matched else "")
        pinfo = PRESET_DEFINITIONS.get(primary, {})
        opp_type = _opportunity_type(primary, data.get("ma_cross", "none"), data.get("bb_pct"))
        time_hor = _time_horizon(data.get("volume_ratio"), data.get("rsi_14"), data.get("ma_cross", "none"))
        conf     = _confidence(score, len(matched))

        # Build human-readable "why" sentence
        parts = []
        if data.get("ma_cross") == "golden_cross":
            parts.append("Golden Cross")
        if (data.get("rsi_14") or 50) <= 30:
            parts.append(f"oversold RSI {data.get('rsi_14', 0):.0f}")
        if (data.get("volume_ratio") or 0) >= 2:
            parts.append(f"vol surge {data.get('volume_ratio', 0):.1f}×")
        if (data.get("change_pct") or 0) >= 2:
            parts.append(f"+{data.get('change_pct', 0):.1f}% today")
        if data.get("bb_squeeze"):
            parts.append("Bollinger squeeze")
        if not parts and data.get("match_reasons"):
            parts.append(data["match_reasons"][0])
        why = " · ".join(parts[:3]) or pinfo.get("desc", "")

        opportunities.append(OpportunityItem(
            symbol=sym,
            name=data.get("name"),
            region=region_map.get(sym, "global"),
            price=data.get("price"),
            change_pct=data.get("change_pct"),
            volume_ratio=data.get("volume_ratio"),
            rsi_14=data.get("rsi_14"),
            macd_hist=data.get("macd_hist"),
            bb_pct=data.get("bb_pct"),
            bb_squeeze=data.get("bb_squeeze", False),
            atr_14=data.get("atr_14"),
            week_52_high=data.get("week_52_high"),
            week_52_low=data.get("week_52_low"),
            pct_from_52w_high=data.get("pct_from_52w_high"),
            overall=data.get("overall", "hold"),
            trend_signal=data.get("trend_signal", "neutral"),
            ma_cross=data.get("ma_cross", "none"),
            entry_price=data.get("entry_price"),
            stop_loss=data.get("stop_loss"),
            target_price=data.get("target_price"),
            risk_reward=data.get("risk_reward"),
            sparkline=data.get("sparkline", []),
            opportunity_score=score,
            opportunity_type=opp_type,
            time_horizon=time_hor,
            confidence=conf,
            matched_presets=matched,
            match_reasons=data["match_reasons"],
            preset_icons=data["preset_icons"],
            primary_preset=pinfo.get("label", primary),
            primary_color=pinfo.get("color", "#7c3aed"),
            why=why,
            data_source=data.get("data_source", "db"),
        ))

    opportunities.sort(key=lambda o: o.opportunity_score, reverse=True)

    resp = OpportunitiesResponse(
        opportunities=opportunities[:limit],
        universe=len(available),
        total_matched=len(opportunities),
        presets_run=len(PRESET_DEFINITIONS),
        high_conf=sum(1 for o in opportunities if o.confidence == "HIGH"),
        breakouts=sum(1 for o in opportunities if o.opportunity_type in ("BREAKOUT", "GOLDEN_CROSS")),
        reversals=sum(1 for o in opportunities if o.opportunity_type == "REVERSAL"),
        as_of=datetime.now(timezone.utc).isoformat(),
    )
    await redis.setex(cache_key, 300, resp.model_dump_json())
    return resp


@router.post("/seed-universe")
async def seed_universe(
    region: Optional[str] = Query(None, description="india | us | all"),
    db: AsyncSession       = Depends(get_db),
    redis                  = Depends(get_redis),
):
    """Seed 6-month daily price history for the screener universe from Yahoo Finance."""
    import httpx
    from datetime import date

    universe = NIFTY50 if region == "india" else US_STOCKS if region == "us" else FULL_UNIVERSE

    existing = await db.execute(text("""
        SELECT symbol FROM (
            SELECT symbol, COUNT(*) as cnt FROM price_data
            WHERE symbol = ANY(:syms) GROUP BY symbol
        ) sub WHERE cnt >= 60
    """), {"syms": universe})
    skip = {r.symbol for r in existing.fetchall()}
    to_fetch = [s for s in universe if s not in skip]

    headers = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36", "Accept": "application/json"}
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
                    errors.append(f"{symbol}: HTTP {r.status_code}"); continue
                data = r.json()
                result = data.get("chart", {}).get("result", [])
                if not result:
                    errors.append(f"{symbol}: no data"); continue
                result = result[0]
                timestamps = result.get("timestamp", [])
                quote = result.get("indicators", {}).get("quote", [{}])[0]
                opens, highs, lows, closes, volumes = (
                    quote.get("open", []), quote.get("high", []), quote.get("low", []),
                    quote.get("close", []), quote.get("volume", []),
                )
                meta = result.get("meta", {})
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
                        "sym": symbol, "ts": dt,
                        "o": opens[i]   if i < len(opens)   else None,
                        "h": highs[i]   if i < len(highs)   else None,
                        "l": lows[i]    if i < len(lows)    else None,
                        "c": closes[i],
                        "v": int(volumes[i]) if i < len(volumes) and volumes[i] else None,
                    })
                    inserted += 1
                await db.commit()
                inserted_total += inserted
                logger.info("Seeded %s: %d rows", symbol, inserted)
                await asyncio.sleep(0.25)
            except Exception as e:
                errors.append(f"{symbol}: {e}")
                logger.warning("Seed error %s: %s", symbol, e)

    async for key in redis.scan_iter("screener:*"):
        await redis.delete(key)
    async for key in redis.scan_iter("opps_v2:*"):
        await redis.delete(key)

    return {"status": "ok", "seeded": len(to_fetch), "skipped": len(skip),
            "rows_inserted": inserted_total, "errors": errors[:20]}
