"""
News Intelligence Router
Aggregates, scores, and stores news with AI sentiment analysis and embeddings.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from data_ingestion import DataIngestionEngine
from llm_router import LLMRouter, TaskType
from models.schemas import NewsItem, NewsSearchRequest
from main import get_db, get_llm, get_redis

logger = logging.getLogger(__name__)
router = APIRouter()
ingestion = DataIngestionEngine()


@router.get("/", response_model=list[NewsItem])
async def get_news(
    limit:     int   = Query(50, ge=1, le=200),
    offset:    int   = Query(0,  ge=0),
    sentiment: Optional[str] = Query(None, regex="^(bullish|bearish|neutral)$"),
    impact_min: int  = Query(0,  ge=0, le=100),
    symbol:    Optional[str] = None,
    hours_back: int  = Query(24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
):
    """Fetch stored news with optional filtering."""
    filters = ["published_at > NOW() - :hours_back * INTERVAL '1 hour'"]
    params: dict = {"hours_back": hours_back, "limit": limit, "offset": offset, "impact_min": impact_min}

    if sentiment:
        filters.append("sentiment = :sentiment")
        params["sentiment"] = sentiment
    if impact_min > 0:
        filters.append("impact_score >= :impact_min")
    if symbol:
        filters.append(":symbol = ANY(affected_symbols)")
        params["symbol"] = symbol.upper()

    where = " AND ".join(filters)
    result = await db.execute(
        text(f"""
            SELECT id, headline, source, url, published_at, sentiment,
                   sentiment_score, impact_score, affected_symbols, summary
            FROM news
            WHERE {where}
            ORDER BY published_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    rows = result.fetchall()
    return [NewsItem(**dict(r._mapping)) for r in rows]


@router.get("/impact-distribution")
async def get_impact_distribution(
    hours_back: int = Query(24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
):
    """Get news split by sentiment category for the news intelligence panel."""
    result = await db.execute(
        text("""
            SELECT
                sentiment,
                COUNT(*) as count,
                AVG(impact_score) as avg_impact,
                ARRAY_AGG(
                    JSON_BUILD_OBJECT(
                        'id',          id,
                        'headline',    headline,
                        'source',      source,
                        'published_at',published_at,
                        'impact_score',impact_score,
                        'summary',     summary,
                        'url',         url
                    ) ORDER BY impact_score DESC NULLS LAST
                ) FILTER (WHERE impact_score IS NOT NULL) as items
            FROM news
            WHERE published_at > NOW() - :hours * INTERVAL '1 hour'
              AND sentiment IS NOT NULL
            GROUP BY sentiment
        """),
        {"hours": hours_back},
    )
    rows = result.fetchall()
    distribution = {r.sentiment: {"count": r.count, "avg_impact": round(float(r.avg_impact or 0), 1), "items": (r.items or [])[:5]} for r in rows}
    # Ensure all three sentiments present
    for s in ("bullish", "bearish", "neutral"):
        distribution.setdefault(s, {"count": 0, "avg_impact": 0, "items": []})
    return distribution


@router.post("/search")
async def search_news(
    req: NewsSearchRequest,
    db:  AsyncSession = Depends(get_db),
    llm: LLMRouter    = Depends(get_llm),
):
    """Vector similarity search over news embeddings (RAG)."""
    try:
        embeddings = await llm.embed([req.query])
        embedding  = embeddings[0]

        if all(v == 0 for v in embedding):
            # Fallback to full-text search
            result = await db.execute(
                text("""
                    SELECT id, headline, source, url, published_at, sentiment,
                           sentiment_score, impact_score, affected_symbols, summary
                    FROM news
                    WHERE headline ILIKE :query
                    ORDER BY published_at DESC
                    LIMIT :limit
                """),
                {"query": f"%{req.query}%", "limit": req.limit},
            )
        else:
            embedding_str = "[" + ",".join(str(v) for v in embedding) + "]"
            result = await db.execute(
                text("""
                    SELECT id, headline, source, url, published_at, sentiment,
                           sentiment_score, impact_score, affected_symbols, summary,
                           1 - (embedding <=> CAST(:emb AS vector)) AS similarity
                    FROM news
                    WHERE embedding IS NOT NULL
                    ORDER BY embedding <=> CAST(:emb AS vector)
                    LIMIT :limit
                """),
                {"emb": embedding_str, "limit": req.limit},
            )
        rows = result.fetchall()
        return [dict(r._mapping) for r in rows]

    except Exception as e:
        logger.error("News search failed: %s", e)
        return []


@router.post("/ingest")
async def ingest_fresh_news(
    db:    AsyncSession = Depends(get_db),
    llm:   LLMRouter    = Depends(get_llm),
    redis              = Depends(get_redis),
):
    """
    Manually trigger news ingestion + sentiment + embedding pipeline.
    Normally called by the scheduler every 10 minutes.
    """
    # Fetch from all sources
    raw_news: list[dict] = []
    try:
        raw_news.extend(await ingestion.fetch_finnhub_news())
    except Exception as e:
        logger.warning("Finnhub fetch failed: %s", e)
    try:
        raw_news.extend(await ingestion.fetch_marketaux_news(limit=20))
    except Exception as e:
        logger.warning("MarketAux fetch failed: %s", e)

    if not raw_news:
        return {"inserted": 0, "message": "No news fetched"}

    # Deduplicate by headline
    seen: set[str] = set()
    unique = []
    for item in raw_news:
        key = item["headline"][:100].lower()
        if key not in seen:
            seen.add(key)
            unique.append(item)

    # Batch sentiment via Cohere Classify
    headlines = [item["headline"] for item in unique]
    sentiments = await llm.classify_sentiment(headlines)

    # Generate embeddings
    embeddings = await llm.embed(headlines)

    # Compute impact scores (rule-based + sentiment confidence)
    inserted = 0
    for i, item in enumerate(unique):
        sent_data = sentiments[i] if i < len(sentiments) else {"label": "neutral", "confidence": 0.5}
        embedding = embeddings[i] if i < len(embeddings) else None

        sent_score = sent_data["confidence"] if sent_data["label"] == "bullish" else \
                     -sent_data["confidence"] if sent_data["label"] == "bearish" else 0.0

        # Impact score: based on source credibility + sentiment strength
        impact = _calc_impact_score(
            item.get("source", ""),
            abs(sent_score),
            item.get("affected_symbols", []),
        )

        embed_val = None
        if embedding and not all(v == 0 for v in embedding):
            embed_val = "[" + ",".join(str(v) for v in embedding) + "]"

        try:
            await db.execute(
                text("""
                    INSERT INTO news (headline, source, url, published_at, content,
                                     sentiment, sentiment_score, impact_score,
                                     affected_symbols, embedding)
                    SELECT :headline, :source, :url, :published_at, :content,
                           :sentiment, :sentiment_score, :impact_score,
                           :affected_symbols, CAST(:embedding AS vector)
                    WHERE NOT EXISTS (
                        SELECT 1 FROM news
                        WHERE (url = :url AND :url IS NOT NULL AND :url != '')
                           OR LOWER(SUBSTRING(headline,1,120)) = LOWER(SUBSTRING(:headline,1,120))
                    )
                """),
                {
                    "headline":        item["headline"][:500],
                    "source":          item.get("source", "unknown"),
                    "url":             item.get("url", ""),
                    "published_at":    item.get("published_at", datetime.now(timezone.utc)),
                    "content":         (item.get("content") or "")[:5000],
                    "sentiment":       sent_data["label"],
                    "sentiment_score": round(sent_score, 4),
                    "impact_score":    impact,
                    "affected_symbols": item.get("affected_symbols", []),
                    "embedding":       embed_val,
                },
            )
            inserted += 1
        except Exception as e:
            logger.warning("News insert failed: %s", e)

    await db.commit()
    logger.info("News ingestion: %d/%d items inserted", inserted, len(unique))
    return {"inserted": inserted, "total_fetched": len(raw_news)}


def _calc_impact_score(source: str, sentiment_strength: float, symbols: list[str]) -> int:
    """
    Calculate news impact score 0-100.
    Higher = more market-moving.
    """
    score = int(sentiment_strength * 50)  # base from sentiment strength

    # Source credibility bonus
    tier1 = {"reuters", "bloomberg", "wsj", "ft", "cnbc", "marketwatch"}
    tier2 = {"yahoo finance", "seeking alpha", "zerohedge", "marketaux"}
    src_lower = source.lower()
    if any(t in src_lower for t in tier1):
        score += 30
    elif any(t in src_lower for t in tier2):
        score += 15
    else:
        score += 5

    # More affected symbols = broader market impact
    score += min(len(symbols) * 5, 20)

    return min(score, 100)
