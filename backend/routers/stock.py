"""
Stock Deep Dive Router — profile, history, news, technical, search.
All data fetched from yfinance (free) + Finnhub.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import httpx
import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from main import get_db, get_redis

logger = logging.getLogger(__name__)
router = APIRouter()

FINNHUB_KEY = os.getenv("FINNHUB_KEY", "")
CACHE_TTL   = 1800  # 30 min for profile/technical


# ── Schemas ──────────────────────────────────────────────────────
class StockProfile(BaseModel):
    symbol:         str
    name:           str
    sector:         Optional[str]         = None
    industry:       Optional[str]         = None
    country:        Optional[str]         = None
    exchange:       Optional[str]         = None
    currency:       Optional[str]         = None
    market_cap:     Optional[float]       = None
    pe_ratio:       Optional[float]       = None
    eps:            Optional[float]       = None
    beta:           Optional[float]       = None
    dividend_yield: Optional[float]       = None
    week_52_high:   Optional[float]       = None
    week_52_low:    Optional[float]       = None
    avg_volume:     Optional[int]         = None
    description:    Optional[str]         = None
    website:        Optional[str]         = None
    logo_url:       Optional[str]         = None

class OHLCVBar(BaseModel):
    date:   str
    open:   Optional[float] = None
    high:   Optional[float] = None
    low:    Optional[float] = None
    close:  float
    volume: Optional[int]   = None

class StockNewsItem(BaseModel):
    headline:     str
    source:       Optional[str] = None
    url:          Optional[str] = None
    published_at: str           = ""
    sentiment:    str           = "neutral"
    summary:      Optional[str] = None

class SearchResult(BaseModel):
    symbol:   str
    name:     str           = ""
    exchange: Optional[str] = None
    type:     str           = "EQUITY"


# ── Helpers ──────────────────────────────────────────────────────
def _safe_float(val) -> Optional[float]:
    try:
        f = float(val)
        return round(f, 4) if f == f else None  # NaN check
    except (TypeError, ValueError):
        return None

def _safe_int(val) -> Optional[int]:
    try:
        return int(val)
    except (TypeError, ValueError):
        return None

def _guess_sentiment(headline: str) -> str:
    h = headline.lower()
    bull_words = ["surge", "rally", "gain", "beat", "profit", "rise", "high", "record", "strong", "growth", "up", "boost", "positive", "buy", "outperform"]
    bear_words = ["fall", "drop", "decline", "miss", "loss", "plunge", "crash", "weak", "sell", "downgrade", "cut", "concern", "risk", "warn"]
    b = sum(1 for w in bull_words if w in h)
    s = sum(1 for w in bear_words if w in h)
    if b > s:    return "bullish"
    if s > b:    return "bearish"
    return "neutral"


# ── Endpoints ────────────────────────────────────────────────────
@router.get("/search", response_model=list[SearchResult])
async def search_stocks(q: str = Query(..., min_length=1)):
    """Search stocks by ticker or company name via Yahoo Finance API."""
    if not q.strip():
        return []
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                "https://query2.finance.yahoo.com/v1/finance/search",
                params={"q": q, "quotesCount": 8, "newsCount": 0, "listsCount": 0},
                headers={"User-Agent": "Mozilla/5.0 (compatible; Omniscient/1.0)"},
            )
            r.raise_for_status()
            data   = r.json()
            quotes = data.get("quotes", [])
        return [
            SearchResult(
                symbol   = item.get("symbol", ""),
                name     = item.get("longname") or item.get("shortname", ""),
                exchange = item.get("exchDisp") or item.get("exchange"),
                type     = item.get("quoteType", "EQUITY"),
            )
            for item in quotes if item.get("symbol")
        ]
    except Exception as e:
        logger.warning("Stock search error for %s: %s", q, e)
        return []


YF_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}

async def _fetch_chart_meta(sym: str) -> dict:
    """Fetch chart meta (price, currency, name) via Yahoo Finance v8 chart API."""
    async with httpx.AsyncClient(timeout=10, headers=YF_HEADERS) as client:
        r = await client.get(
            f"https://query2.finance.yahoo.com/v8/finance/chart/{sym}",
            params={"interval": "1d", "range": "1d"},
        )
        r.raise_for_status()
        data   = r.json()
        result = data.get("chart", {}).get("result", [None])[0] or {}
        return result.get("meta", {})

async def _fetch_quote_summary(sym: str, modules: str) -> dict:
    """Fetch detailed info via Yahoo Finance quoteSummary."""
    async with httpx.AsyncClient(timeout=12, headers=YF_HEADERS) as client:
        r = await client.get(
            f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{sym}",
            params={"modules": modules, "formatted": "false"},
        )
        if r.status_code != 200:
            return {}
        data   = r.json()
        result = data.get("quoteSummary", {}).get("result", [None]) or [None]
        return result[0] or {}


async def _fetch_finnhub(path: str, params: dict) -> dict:
    """Fetch from Finnhub API."""
    if not FINNHUB_KEY:
        return {}
    params["token"] = FINNHUB_KEY
    async with httpx.AsyncClient(timeout=8) as client:
        r = await client.get(f"https://finnhub.io/api/v1{path}", params=params)
        if r.status_code != 200:
            return {}
        return r.json() or {}


@router.get("/{symbol}/profile", response_model=StockProfile)
async def stock_profile(symbol: str, redis=Depends(get_redis)):
    """Fetch stock profile: Finnhub for fundamentals + Yahoo Finance chart for price data."""
    import json
    sym = symbol.upper()
    cache_key = f"stock:profile:{sym}"
    cached = await redis.get(cache_key)
    if cached:
        return StockProfile(**json.loads(cached))

    try:
        # Parallel fetch: chart meta (Yahoo) + profile (Finnhub) + metrics (Finnhub)
        chart_meta, fh_profile, fh_metrics = await asyncio.gather(
            _fetch_chart_meta(sym),
            _fetch_finnhub("/stock/profile2", {"symbol": sym}),
            _fetch_finnhub("/stock/metric", {"symbol": sym, "metric": "all"}),
            return_exceptions=True,
        )
        if isinstance(chart_meta,  Exception): chart_meta  = {}
        if isinstance(fh_profile,  Exception): fh_profile  = {}
        if isinstance(fh_metrics,  Exception): fh_metrics  = {}

        metrics = fh_metrics.get("metric", {}) or {}
        name    = (fh_profile.get("name") or chart_meta.get("longName") or
                   chart_meta.get("shortName") or sym)

        profile = StockProfile(
            symbol         = sym,
            name           = name,
            sector         = fh_profile.get("finnhubIndustry"),
            industry       = fh_profile.get("finnhubIndustry"),
            country        = fh_profile.get("country"),
            exchange       = fh_profile.get("exchange") or chart_meta.get("fullExchangeName"),
            currency       = fh_profile.get("currency") or chart_meta.get("currency"),
            market_cap     = _safe_float(fh_profile.get("marketCapitalization")),
            pe_ratio       = _safe_float(metrics.get("peBasicExclExtraTTM") or metrics.get("peTTM")),
            eps            = _safe_float(metrics.get("epsBasicExclExtraItemsAnnual") or metrics.get("epsTTM")),
            beta           = _safe_float(metrics.get("beta")),
            dividend_yield = _safe_float(metrics.get("currentDividendYieldTTM")),
            week_52_high   = _safe_float(metrics.get("52WeekHigh") or chart_meta.get("fiftyTwoWeekHigh")),
            week_52_low    = _safe_float(metrics.get("52WeekLow") or chart_meta.get("fiftyTwoWeekLow")),
            avg_volume     = _safe_int(metrics.get("10DayAverageTradingVolume") or chart_meta.get("regularMarketVolume")),
            website        = fh_profile.get("weburl"),
        )
        await redis.setex(cache_key, CACHE_TTL, profile.model_dump_json())
        return profile
    except Exception as e:
        logger.warning("Stock profile error for %s: %s", sym, e)
        return StockProfile(symbol=sym, name=sym)


PERIOD_MAP  = {"1mo": "1mo", "3mo": "3mo", "6mo": "6mo", "1y": "1y", "2y": "2y", "5y": "5y"}
INTERVAL_MAP = {"1d": "1d", "1wk": "1wk", "1mo": "1mo"}

@router.get("/{symbol}/history", response_model=list[OHLCVBar])
async def stock_history(
    symbol:   str,
    period:   str = Query("1y", regex="^(1mo|3mo|6mo|1y|2y|5y)$"),
    interval: str = Query("1d", regex="^(1d|1wk|1mo)$"),
):
    """Fetch OHLCV candles from Yahoo Finance chart API."""
    sym = symbol.upper()
    try:
        async with httpx.AsyncClient(timeout=15, headers=YF_HEADERS) as client:
            r = await client.get(
                f"https://query2.finance.yahoo.com/v8/finance/chart/{sym}",
                params={"interval": INTERVAL_MAP.get(interval, "1d"), "range": PERIOD_MAP.get(period, "1y")},
            )
            r.raise_for_status()
            data   = r.json()
            result = (data.get("chart", {}).get("result") or [None])[0]
            if not result:
                return []

        timestamps = result.get("timestamp", [])
        ohlcv      = result.get("indicators", {}).get("quote", [{}])[0]
        adj_close  = result.get("indicators", {}).get("adjclose", [{}])
        closes     = ohlcv.get("close") or []
        opens      = ohlcv.get("open") or closes
        highs      = ohlcv.get("high") or closes
        lows       = ohlcv.get("low") or closes
        volumes    = ohlcv.get("volume") or []

        bars = []
        for i, ts in enumerate(timestamps):
            close = closes[i] if i < len(closes) else None
            if close is None:
                continue
            bars.append(OHLCVBar(
                date   = str(date.fromtimestamp(ts)),
                open   = _safe_float(opens[i] if i < len(opens) else None),
                high   = _safe_float(highs[i] if i < len(highs) else None),
                low    = _safe_float(lows[i] if i < len(lows) else None),
                close  = float(close),
                volume = _safe_int(volumes[i] if i < len(volumes) else None),
            ))
        return bars
    except Exception as e:
        logger.warning("Stock history error %s: %s", sym, e)
        return []


@router.get("/{symbol}/news", response_model=list[StockNewsItem])
async def stock_news(symbol: str, days: int = Query(30, ge=1, le=90)):
    """Fetch company news from Finnhub for the given symbol."""
    if not FINNHUB_KEY:
        return []
    from_date = (date.today() - timedelta(days=days)).isoformat()
    to_date   = date.today().isoformat()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://finnhub.io/api/v1/company-news",
                params={"symbol": symbol.upper(), "from": from_date, "to": to_date, "token": FINNHUB_KEY},
            )
            r.raise_for_status()
            items = r.json()
        return [
            StockNewsItem(
                headline    = item.get("headline", ""),
                source      = item.get("source"),
                url         = item.get("url"),
                published_at= datetime.fromtimestamp(item["datetime"], tz=timezone.utc).isoformat() if item.get("datetime") else "",
                sentiment   = _guess_sentiment(item.get("headline", "")),
                summary     = item.get("summary"),
            )
            for item in items[:40]
        ]
    except Exception as e:
        logger.warning("Stock news error %s: %s", symbol, e)
        return []


@router.get("/{symbol}/technical")
async def stock_technical(symbol: str, db: AsyncSession = Depends(get_db)):
    """
    Return technical indicators for any symbol.
    Tries price_data table first, falls back to fetching 6mo from Yahoo Finance.
    """
    from routers.technical import (
        calc_rsi, calc_sma, calc_ema, calc_macd, calc_bollinger,
        classify_rsi, classify_trend, classify_ma_cross, classify_volume, overall_signal,
    )
    result = await db.execute(
        text("""
            SELECT ts, close, volume FROM price_data
            WHERE symbol = :sym ORDER BY ts ASC LIMIT 300
        """),
        {"sym": symbol.upper()},
    )
    rows = result.fetchall()

    closes  = [float(r.close) for r in rows]
    volumes = [int(r.volume or 0) for r in rows]

    # If insufficient data, fetch directly from Yahoo Finance chart API
    if len(closes) < 30:
        try:
            async with httpx.AsyncClient(timeout=12, headers=YF_HEADERS) as client:
                r = await client.get(
                    f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol.upper()}",
                    params={"interval": "1d", "range": "6mo"},
                )
                if r.status_code == 200:
                    data   = r.json()
                    result = (data.get("chart", {}).get("result") or [None])[0]
                    if result:
                        ohlcv   = result.get("indicators", {}).get("quote", [{}])[0]
                        raw_c   = ohlcv.get("close") or []
                        raw_v   = ohlcv.get("volume") or []
                        closes  = [float(v) for v in raw_c if v is not None]
                        volumes = [int(v or 0) for v in raw_v]
        except Exception as e:
            logger.warning("Yahoo fallback failed for %s: %s", symbol, e)

    if len(closes) < 14:
        return {"error": "Insufficient data for technical analysis"}

    rsi       = calc_rsi(closes)
    sma_20    = calc_sma(closes, 20)
    sma_50    = calc_sma(closes, 50)
    sma_200   = calc_sma(closes, 200)
    macd_line, macd_sig, macd_hist = calc_macd(closes)
    bb_upper, bb_lower, bb_pct     = calc_bollinger(closes)
    price     = closes[-1]
    high_52   = max(closes[-252:] if len(closes) >= 252 else closes)
    low_52    = min(closes[-252:] if len(closes) >= 252 else closes)

    rsi_sig   = classify_rsi(rsi)
    trend     = classify_trend(price, sma_20, sma_50)
    ma_cross  = classify_ma_cross(sma_50, sma_200)
    avg_vol   = sum(volumes[-20:]) / max(len(volumes[-20:]), 1) if volumes else 1
    vol_ratio = volumes[-1] / avg_vol if volumes and avg_vol > 0 else 1.0
    vol_sig   = classify_volume(vol_ratio)
    signal    = overall_signal(rsi_sig, trend, macd_hist, vol_sig, ma_cross, bb_pct)

    return {
        "symbol":      symbol.upper(),
        "price":       round(price, 2),
        "rsi_14":      round(rsi, 2) if rsi else None,
        "sma_20":      round(sma_20, 2) if sma_20 else None,
        "sma_50":      round(sma_50, 2) if sma_50 else None,
        "sma_200":     round(sma_200, 2) if sma_200 else None,
        "macd":        round(macd_line, 3) if macd_line else None,
        "macd_signal": round(macd_sig, 3) if macd_sig else None,
        "macd_hist":   round(macd_hist, 3) if macd_hist else None,
        "bb_upper":    round(bb_upper, 2) if bb_upper else None,
        "bb_lower":    round(bb_lower, 2) if bb_lower else None,
        "bb_pct":      round(bb_pct, 3) if bb_pct else None,
        "week_52_high": round(high_52, 2),
        "week_52_low":  round(low_52, 2),
        "pct_from_high": round((price - high_52) / high_52 * 100, 2) if high_52 else None,
        "pct_from_low":  round((price - low_52) / low_52 * 100, 2) if low_52 else None,
        "volume_ratio":  round(vol_ratio, 2),
        "rsi_signal":    rsi_sig,
        "trend_signal":  trend,
        "ma_cross":      ma_cross,
        "volume_signal": vol_sig,
        "overall":       signal,
        "data_points":   len(closes),
    }
