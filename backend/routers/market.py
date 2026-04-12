"""
Market Data Router
Endpoints for quotes, price history, regime detection, and world market snapshot.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import redis.asyncio as aioredis

from data_ingestion import DataIngestionEngine
from models.schemas import MarketQuote, MarketSnapshot, PriceTick
from main import get_db, get_redis

logger = logging.getLogger(__name__)
router = APIRouter()

ingestion = DataIngestionEngine()

# All tracked symbols grouped by region
REGION_SYMBOLS = {
    "americas":   ["^GSPC", "^IXIC", "^DJI", "^RUT", "^BVSP", "^MXX"],
    "emea":       ["^FTSE", "^GDAXI", "^FCHI", "^AEX", "^STOXX50E"],
    "asia":       ["^N225", "^HSI", "000001.SS", "^AXJO", "^KS11", "^NSEI"],
    "safe_havens": ["GC=F", "^VIX", "DX-Y.NYB", "^TNX", "CL=F"],
    "india":      ["^NSEI", "^BSESN", "^NSEBANK", "^CNXIT", "^INDIAVIX", "USDINR=X"],
}

CACHE_TTL_QUOTES   = 60    # 1 minute — market hours
CACHE_TTL_HISTORY  = 3600  # 1 hour


@router.get("/snapshot", response_model=MarketSnapshot)
async def get_market_snapshot(
    db:    AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    """
    Full world market snapshot: Americas, EMEA, Asia, Safe Havens.
    Cached for 60 seconds, falls back to DB if live fetch fails.
    """
    cache_key = "market:snapshot"
    cached    = await redis.get(cache_key)
    if cached:
        data = json.loads(cached)
        return MarketSnapshot(**data)

    all_symbols = []
    for syms in REGION_SYMBOLS.values():
        all_symbols.extend(syms)

    # Fetch live quotes
    try:
        quotes = await ingestion.fetch_yahoo_quotes(all_symbols)
    except Exception as e:
        logger.error("Yahoo Finance fetch failed: %s", e)
        quotes = []

    # Fall back to DB for any missing
    db_quotes = await _get_latest_from_db(db, all_symbols)
    live_syms = {q["symbol"] for q in quotes}
    for q in db_quotes:
        if q["symbol"] not in live_syms:
            quotes.append(q)

    # Store fresh prices to DB
    await _upsert_prices(db, quotes)

    # Organize into regions
    by_sym = {q["symbol"]: q for q in quotes}
    regime = ingestion.detect_risk_regime(quotes)

    def make_quote(sym: str) -> Optional[MarketQuote]:
        q = by_sym.get(sym)
        if not q:
            return None
        return MarketQuote(
            symbol     = sym,
            name       = q.get("name", sym),
            region     = _sym_region(sym),
            currency   = "USD",
            asset_class= "equity",
            price      = q.get("price"),
            change     = q.get("change"),
            change_pct = q.get("change_pct"),
            volume     = q.get("volume"),
            ts         = q.get("ts"),
        )

    snapshot = MarketSnapshot(
        americas    = [make_quote(s) for s in REGION_SYMBOLS["americas"]   if make_quote(s)],
        emea        = [make_quote(s) for s in REGION_SYMBOLS["emea"]       if make_quote(s)],
        asia        = [make_quote(s) for s in REGION_SYMBOLS["asia"]       if make_quote(s)],
        safe_havens = [make_quote(s) for s in REGION_SYMBOLS["safe_havens"] if make_quote(s)],
        india       = [make_quote(s) for s in REGION_SYMBOLS["india"]      if make_quote(s)],
        risk_regime = regime,
        updated_at  = datetime.now(timezone.utc),
    )

    # Cache for 60 seconds
    await redis.setex(cache_key, CACHE_TTL_QUOTES, snapshot.model_dump_json())
    return snapshot


@router.get("/quotes")
async def get_quotes(
    symbols: str = Query(..., description="Comma-separated symbols"),
    redis: aioredis.Redis = Depends(get_redis),
    db: AsyncSession = Depends(get_db),
):
    """Get live quotes for specified symbols."""
    sym_list  = [s.strip().upper() for s in symbols.split(",")]
    cache_key = f"quotes:{','.join(sorted(sym_list))}"
    cached    = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    quotes = await ingestion.fetch_yahoo_quotes(sym_list)
    await redis.setex(cache_key, CACHE_TTL_QUOTES, json.dumps(quotes, default=str))
    return quotes


@router.get("/history/{symbol}")
async def get_price_history(
    symbol:   str,
    period:   str = Query("1y", regex="^(1d|5d|1mo|3mo|6mo|1y|2y|5y|max)$"),
    interval: str = Query("1d", regex="^(1m|5m|15m|30m|60m|1d|1wk|1mo)$"),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    """Fetch OHLCV history for charting."""
    cache_key = f"history:{symbol}:{period}:{interval}"
    cached    = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    try:
        bars = await ingestion.fetch_yahoo_history(symbol.upper(), period=period, interval=interval)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Data fetch failed: {e}")

    await redis.setex(cache_key, CACHE_TTL_HISTORY, json.dumps(bars, default=str))
    return bars


@router.get("/indices")
async def get_indices(db: AsyncSession = Depends(get_db)):
    """List all tracked indices."""
    result = await db.execute(
        text("SELECT symbol, name, region, country, currency, timezone, asset_class FROM indices WHERE is_active ORDER BY region, symbol")
    )
    rows = result.fetchall()
    return [dict(r._mapping) for r in rows]


@router.get("/regime")
async def get_risk_regime(redis: aioredis.Redis = Depends(get_redis)):
    """Get current market risk regime from cache."""
    cached = await redis.get("market:snapshot")
    if cached:
        data = json.loads(cached)
        return {"regime": data.get("risk_regime", "neutral"), "updated_at": data.get("updated_at")}
    return {"regime": "neutral", "updated_at": None}


@router.get("/watchlist")
async def get_watchlist_quotes(
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    """Get quotes for all watchlist symbols."""
    result = await db.execute(
        text("SELECT symbol, name, target_price, stop_loss FROM watchlist WHERE is_active ORDER BY added_at")
    )
    rows = result.fetchall()
    symbols = [r.symbol for r in rows]
    if not symbols:
        return []

    quotes = await ingestion.fetch_yahoo_quotes(symbols)
    by_sym = {q["symbol"]: q for q in quotes}

    enriched = []
    for row in rows:
        q = by_sym.get(row.symbol, {})
        enriched.append({
            **dict(row._mapping),
            "price":      q.get("price"),
            "change":     q.get("change"),
            "change_pct": q.get("change_pct"),
            "volume":     q.get("volume"),
        })
    return enriched


@router.get("/economic-calendar")
async def get_economic_calendar(
    days_ahead: int = Query(7, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    """Get upcoming economic events."""
    cache_key = f"econ_cal:{days_ahead}"
    cached    = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    events = await ingestion.fetch_economic_calendar(days_ahead)
    await redis.setex(cache_key, 3600, json.dumps(events, default=str))
    return events


# ── Helpers ───────────────────────────────────────────────────────

async def _get_latest_from_db(db: AsyncSession, symbols: list[str]) -> list[dict]:
    if not symbols:
        return []
    result = await db.execute(
        text("""
            SELECT symbol, close as price, ts,
                   close - LAG(close) OVER (PARTITION BY symbol ORDER BY ts) as change
            FROM price_data
            WHERE symbol = ANY(:symbols)
            ORDER BY symbol, ts DESC
        """),
        {"symbols": symbols},
    )
    return [dict(r._mapping) for r in result.fetchall()]


async def _upsert_prices(db: AsyncSession, quotes: list[dict]):
    """
    Store one price record per symbol per trading day.
    Rounds ts to midnight UTC so the ON CONFLICT deduplicates within the same day,
    keeping the most recent intraday quote as the current day's bar.
    Over time this builds a daily OHLCV history for momentum calculations.
    """
    if not quotes:
        return
    now_utc = datetime.now(timezone.utc)
    day_ts  = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    for q in quotes:
        await db.execute(
            text("""
                INSERT INTO price_data (symbol, ts, close, volume)
                VALUES (:symbol, :ts, :close, :volume)
                ON CONFLICT (symbol, ts) DO UPDATE SET close = EXCLUDED.close, volume = EXCLUDED.volume
            """),
            {
                "symbol": q["symbol"],
                "ts":     day_ts,
                "close":  q.get("price"),
                "volume": q.get("volume"),
            },
        )
    await db.commit()


def _sym_region(sym: str) -> str:
    for region, syms in REGION_SYMBOLS.items():
        if sym in syms:
            return region
    return "global"
