"""
Momentum Scanner Router
Multi-factor momentum analysis across all tracked securities.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from data_ingestion import DataIngestionEngine
from momentum_calc import MomentumCalculator
from llm_router import LLMRouter, TaskType
from models.schemas import MomentumScore, MomentumScanResult
from main import get_db, get_llm, get_redis

logger = logging.getLogger(__name__)
router = APIRouter()

ingestion  = DataIngestionEngine()
calculator = MomentumCalculator()

CACHE_TTL_MOMENTUM = 1800  # 30 minutes


@router.get("/scan", response_model=MomentumScanResult)
async def momentum_scan(
    region:      Optional[str] = Query(None),
    asset_class: Optional[str] = Query(None),
    top_n:       int           = Query(10, ge=5, le=50),
    db:          AsyncSession  = Depends(get_db),
    redis                      = Depends(get_redis),
):
    """
    Run the momentum scanner — returns leaders and laggards.
    Results cached for 30 minutes, recalculated by scheduler.
    """
    cache_key = f"momentum:scan:{region or 'all'}:{asset_class or 'all'}:{top_n}"
    cached    = await redis.get(cache_key)
    if cached:
        data = json.loads(cached)
        return MomentumScanResult(**data)

    # Fetch latest momentum from DB — exclude index/futures symbols
    filters = [
        "ms.symbol NOT LIKE '^%'",
        "ms.symbol NOT LIKE '%=F'",
        "ms.symbol NOT LIKE '%=X'",
        "ms.symbol NOT LIKE '%.%'",           # e.g. 000001.SS
        "ms.symbol NOT LIKE '%-Y.%'",         # e.g. DX-Y.NYB
        "ms.price_momentum_1d IS NOT NULL",   # must have live data
    ]
    params: dict = {}
    if region:
        filters.append("COALESCE(i.region, 'americas') = :region")
        params["region"] = region
    if asset_class:
        filters.append("COALESCE(i.asset_class, 'equity') = :asset_class")
        params["asset_class"] = asset_class

    where = " AND ".join(filters)
    result = await db.execute(
        text(f"""
            SELECT DISTINCT ON (ms.symbol)
                ms.symbol, ms.calculated_at,
                ms.price_momentum_1d, ms.price_momentum_1w,
                ms.price_momentum_1m, ms.price_momentum_3m,
                ms.volume_momentum, ms.relative_strength,
                ms.composite_score, ms.percentile_rank,
                ms.regime, ms.ai_commentary,
                COALESCE(i.name, ms.symbol)        AS name,
                COALESCE(i.region, 'americas')     AS region,
                COALESCE(i.asset_class, 'equity')  AS asset_class
            FROM momentum_scores ms
            LEFT JOIN indices i ON i.symbol = ms.symbol
            WHERE {where}
            ORDER BY ms.symbol, ms.calculated_at DESC
        """),
        params,
    )
    rows = result.fetchall()

    if not rows:
        # No cached momentum — compute on the fly for watchlist
        scores = await _compute_live_momentum(db)
    else:
        scores = [dict(r._mapping) for r in rows]

    leaders, laggards = calculator.get_leaders_laggards(scores, top_n=top_n)

    result_obj = MomentumScanResult(
        leaders   = [MomentumScore(**s) for s in leaders],
        laggards  = [MomentumScore(**s) for s in laggards],
        updated_at = datetime.now(timezone.utc),
    )

    await redis.setex(cache_key, CACHE_TTL_MOMENTUM, result_obj.model_dump_json())
    return result_obj


@router.get("/symbol/{symbol}")
async def get_symbol_momentum(
    symbol: str,
    db:     AsyncSession = Depends(get_db),
):
    """Get detailed momentum score for a single symbol."""
    result = await db.execute(
        text("""
            SELECT ms.*, i.name, i.region, i.asset_class
            FROM momentum_scores ms
            JOIN indices i ON i.symbol = ms.symbol
            WHERE ms.symbol = :symbol
            ORDER BY ms.calculated_at DESC
            LIMIT 1
        """),
        {"symbol": symbol.upper()},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"No momentum data for {symbol}")
    return dict(row._mapping)


@router.post("/recalculate")
async def recalculate_momentum(
    db:    AsyncSession = Depends(get_db),
    llm:   LLMRouter    = Depends(get_llm),
    redis              = Depends(get_redis),
):
    """
    Recalculate momentum for all tracked securities.
    Strategy:
      1. Try accumulated price_data in the DB first (free, instant)
      2. For symbols with < 22 bars in DB, fetch from Alpha Vantage (25/day limit)
      3. Add 1s delay between AV calls; stop at 20 calls today to leave headroom
    Normally run by scheduler every 30 minutes.
    """
    # Use watchlist + any equity symbols with sufficient price history (from backfill)
    # Exclude index/futures symbols (^, =F, =X) which have incompatible price scales
    wl_result = await db.execute(text("SELECT symbol FROM watchlist ORDER BY symbol"))
    pd_result = await db.execute(text("""
        SELECT symbol FROM (
            SELECT symbol, COUNT(*) as cnt FROM price_data GROUP BY symbol
        ) s WHERE cnt >= 22
          AND symbol NOT LIKE '^%'
          AND symbol NOT LIKE '%=F'
          AND symbol NOT LIKE '%=X'
        ORDER BY cnt DESC
    """))
    idx_result = await db.execute(text("""
        SELECT symbol FROM indices WHERE is_active
          AND symbol NOT LIKE '^%'
          AND symbol NOT LIKE '%=F'
          AND symbol NOT LIKE '%=X'
        ORDER BY symbol
    """))
    wl_symbols  = [r.symbol for r in wl_result.fetchall()]
    pd_symbols  = [r.symbol for r in pd_result.fetchall()]
    idx_symbols = [r.symbol for r in idx_result.fetchall()]
    symbols     = list(dict.fromkeys(wl_symbols + pd_symbols + idx_symbols))  # deduplicate, watchlist first

    # Track Alpha Vantage calls today
    av_key       = f"av_calls:{datetime.now(timezone.utc).strftime('%Y-%m-%d')}"
    av_used_raw  = await redis.get(av_key)
    av_used      = int(av_used_raw) if av_used_raw else 0
    AV_DAILY_CAP = 20  # leave 5 calls for other uses

    computed = []
    for sym in symbols:
        try:
            # Step 1: query accumulated price_data from DB
            db_result = await db.execute(
                text("""
                    SELECT ts, close, volume
                    FROM price_data
                    WHERE symbol = :sym
                    ORDER BY ts DESC
                    LIMIT 130
                """),
                {"sym": sym},
            )
            db_bars = db_result.fetchall()

            if len(db_bars) >= 22:
                # Sort ascending for calc
                bars_sorted = sorted(db_bars, key=lambda r: r.ts)
                bars = [{"close": float(r.close), "volume": int(r.volume or 0)} for r in bars_sorted]
            elif av_used < AV_DAILY_CAP:
                # Step 2: fetch from Alpha Vantage (100 days, compact mode)
                raw = await ingestion.fetch_yahoo_history(sym, period="6mo", interval="1d")
                av_used += 1
                await redis.setex(av_key, 86400, av_used)
                await asyncio.sleep(1.2)  # Alpha Vantage rate limit: ~5 req/min on free

                if len(raw) < 22:
                    continue

                # Backfill price_data with historical daily bars
                for bar in raw:
                    try:
                        await db.execute(
                            text("""
                                INSERT INTO price_data (symbol, ts, close, volume)
                                VALUES (:symbol, :ts, :close, :volume)
                                ON CONFLICT (symbol, ts) DO NOTHING
                            """),
                            {"symbol": sym, "ts": bar["ts"], "close": bar["close"], "volume": bar["volume"]},
                        )
                    except Exception:
                        await db.rollback()
                        break
                else:
                    await db.commit()

                bars = [{"close": b["close"], "volume": b["volume"]} for b in raw]
            else:
                logger.info("Skipping %s — not enough DB bars (%d) and AV quota reached", sym, len(db_bars))
                continue

            closes  = [b["close"] for b in bars]
            volumes = [b["volume"] for b in bars]
            score   = calculator.calculate(sym, closes, volumes)
            if score:
                computed.append(score)
        except Exception as e:
            logger.warning("Momentum calc failed for %s: %s", sym, e)

    # Rank universe
    ranked = calculator.rank_universe(computed)

    # Store in DB
    inserted = 0
    for score in ranked:
        try:
            await db.execute(
                text("""
                    INSERT INTO momentum_scores
                        (symbol, calculated_at, price_momentum_1d, price_momentum_1w,
                         price_momentum_1m, price_momentum_3m, volume_momentum,
                         composite_score, percentile_rank, regime, data)
                    VALUES
                        (:symbol, :calculated_at, :pm1d, :pm1w, :pm1m, :pm3m,
                         :vol_mom, :composite, :pct_rank, :regime, CAST(:data AS jsonb))
                    ON CONFLICT (symbol, calculated_at) DO UPDATE SET
                        price_momentum_1d = EXCLUDED.price_momentum_1d,
                        composite_score   = EXCLUDED.composite_score,
                        percentile_rank   = EXCLUDED.percentile_rank,
                        regime            = EXCLUDED.regime
                """),
                {
                    "symbol":       score["symbol"],
                    "calculated_at": score["calculated_at"],
                    "pm1d":         score.get("price_momentum_1d"),
                    "pm1w":         score.get("price_momentum_1w"),
                    "pm1m":         score.get("price_momentum_1m"),
                    "pm3m":         score.get("price_momentum_3m"),
                    "vol_mom":      score.get("volume_momentum"),
                    "composite":    score.get("composite_score"),
                    "pct_rank":     score.get("percentile_rank"),
                    "regime":       score.get("regime"),
                    "data":         json.dumps(score.get("data", {})),
                },
            )
            inserted += 1
        except Exception as e:
            logger.warning("Momentum insert failed for %s: %s", score["symbol"], e)

    await db.commit()

    # Invalidate cache
    async for key in redis.scan_iter("momentum:scan:*"):
        await redis.delete(key)

    return {"recalculated": inserted, "total": len(symbols)}


async def _compute_live_momentum(db: AsyncSession) -> list[dict]:
    """Compute momentum from DB price data (no external API needed)."""
    result = await db.execute(
        text("""
            SELECT p.symbol, i.name, i.region, i.asset_class,
                   ARRAY_AGG(p.close ORDER BY p.ts) as closes,
                   ARRAY_AGG(p.volume ORDER BY p.ts) as volumes
            FROM price_data p
            JOIN indices i ON i.symbol = p.symbol
            WHERE p.ts > NOW() - INTERVAL '90 days'
            GROUP BY p.symbol, i.name, i.region, i.asset_class
            HAVING COUNT(*) >= 22
        """),
    )
    rows = result.fetchall()

    scores = []
    for row in rows:
        score = calculator.calculate(
            row.symbol,
            [float(c) for c in row.closes],
            [int(v or 0) for v in row.volumes],
        )
        if score:
            score["name"]        = row.name
            score["region"]      = row.region
            score["asset_class"] = row.asset_class
            scores.append(score)

    return calculator.rank_universe(scores)
