"""
Morning Briefing Router
AI-generated daily market briefings via Cohere (quality-first).
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from llm_router import LLMRouter, TaskType
from models.schemas import BriefingResponse
from main import get_db, get_llm, get_redis
from data_ingestion import DataIngestionEngine

logger = logging.getLogger(__name__)
router = APIRouter()
ingestion = DataIngestionEngine()

BRIEFING_PROMPT = """You are a senior market strategist writing the morning briefing for a professional solo trader.
Date: {date}
Market Snapshot: {market_data}
Top News: {news_headlines}
Momentum Leaders: {leaders}
Momentum Laggards: {laggards}

Write a concise, actionable morning briefing with these sections:
## 🌍 Overnight Markets
[Key moves in Asia and Europe, what drove them]

## 🎯 Key Themes Today
[3-4 bullet points of the most important market themes]

## 📊 Tactical Levels
[SPX, NDX, VIX — key support/resistance levels to watch]

## 🔥 Momentum Opportunities
[Top 3 setups from momentum scanner — be specific]

## ⚠️ Risk Factors
[What could go wrong today — specific, not generic]

## 🎲 Risk Regime
[Current regime: Risk-On/Risk-Off/Transition — reasoning]

Keep it under 500 words. Be direct, specific, and actionable."""


@router.get("/latest", response_model=BriefingResponse)
async def get_latest_briefing(db: AsyncSession = Depends(get_db)):
    """Get the most recent morning briefing."""
    result = await db.execute(
        text("""
            SELECT id, briefing_date, content, provider,
                   key_themes, risk_regime, created_at
            FROM briefings
            ORDER BY briefing_date DESC
            LIMIT 1
        """)
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="No briefing available yet. Run POST /generate to create one.")
    return BriefingResponse(**dict(row._mapping))


@router.get("/history")
async def get_briefing_history(
    limit: int = 30,
    db: AsyncSession = Depends(get_db),
):
    """Get briefing history."""
    result = await db.execute(
        text("""
            SELECT id, briefing_date, provider, key_themes, risk_regime, created_at
            FROM briefings
            ORDER BY briefing_date DESC
            LIMIT :limit
        """),
        {"limit": limit},
    )
    return [dict(r._mapping) for r in result.fetchall()]


@router.post("/generate", response_model=BriefingResponse)
async def generate_briefing(
    target_date: date | None = None,
    db:    AsyncSession = Depends(get_db),
    llm:   LLMRouter    = Depends(get_llm),
    redis              = Depends(get_redis),
):
    """
    Generate a morning briefing for the specified date (default: today).
    Uses Cohere for quality, falls back to Cerebras/Google.
    """
    briefing_date = target_date or date.today()

    # Check if already generated
    existing = await db.execute(
        text("SELECT id FROM briefings WHERE briefing_date = :d"),
        {"d": briefing_date},
    )
    if existing.fetchone():
        raise HTTPException(status_code=409, detail=f"Briefing for {briefing_date} already exists. Use GET /latest.")

    # Gather market context
    market_data = await _get_market_context(db, redis)
    news_data   = await _get_top_news(db)
    momentum    = await _get_momentum_summary(db)

    prompt = BRIEFING_PROMPT.format(
        date           = briefing_date.strftime("%A, %B %d, %Y"),
        market_data    = market_data,
        news_headlines = news_data,
        leaders        = momentum["leaders"],
        laggards       = momentum["laggards"],
    )

    try:
        content, provider = await llm.complete(
            prompt    = prompt,
            task_type = TaskType.MORNING_BRIEFING,
            max_tokens= 800,
            temperature=0.7,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Briefing generation failed: {e}")

    # Extract key themes (first 3 bullet points from "Key Themes" section)
    key_themes = _extract_themes(content)
    risk_regime = _extract_regime(content)

    # Store in DB
    result = await db.execute(
        text("""
            INSERT INTO briefings (briefing_date, content, provider, key_themes, risk_regime)
            VALUES (:date, :content, :provider, :themes, :regime)
            RETURNING id, briefing_date, content, provider, key_themes, risk_regime, created_at
        """),
        {
            "date":     briefing_date,
            "content":  content,
            "provider": provider,
            "themes":   key_themes,
            "regime":   risk_regime,
        },
    )
    row = result.fetchone()
    await db.commit()

    logger.info("Morning briefing generated via %s for %s", provider, briefing_date)
    return BriefingResponse(**dict(row._mapping))


# ── Helpers ───────────────────────────────────────────────────────

async def _get_market_context(db: AsyncSession, redis) -> str:
    """Get market context string for briefing prompt."""
    cached = await redis.get("market:snapshot")
    if cached:
        import json
        data = json.loads(cached)
        lines = []
        for region in ("americas", "emea", "asia", "safe_havens"):
            for q in data.get(region, [])[:4]:
                chg = q.get("change_pct", 0) or 0
                lines.append(f"{q['symbol']}: {chg:+.2f}%")
        lines.append(f"Regime: {data.get('risk_regime', 'neutral').upper()}")
        return ", ".join(lines)
    return "Market data unavailable"


async def _get_top_news(db: AsyncSession) -> str:
    """Get top news headlines for briefing prompt."""
    result = await db.execute(
        text("""
            SELECT headline, sentiment, impact_score
            FROM news
            WHERE published_at > NOW() - INTERVAL '12 hours'
              AND impact_score IS NOT NULL
            ORDER BY impact_score DESC
            LIMIT 8
        """)
    )
    rows = result.fetchall()
    if not rows:
        return "No recent high-impact news"
    lines = [f"- [{r.sentiment or 'neutral'}] {r.headline}" for r in rows]
    return "\n".join(lines)


async def _get_momentum_summary(db: AsyncSession) -> dict:
    """Get momentum leaders/laggards for briefing."""
    result = await db.execute(
        text("""
            SELECT DISTINCT ON (symbol) symbol, composite_score, regime, price_momentum_1d
            FROM momentum_scores
            WHERE calculated_at > NOW() - INTERVAL '2 hours'
            ORDER BY symbol, calculated_at DESC
        """)
    )
    rows = result.fetchall()
    if not rows:
        return {"leaders": "No momentum data", "laggards": "No momentum data"}

    sorted_rows = sorted(rows, key=lambda r: r.composite_score or 0, reverse=True)
    leaders  = [f"{r.symbol} (+{r.price_momentum_1d:.1f}%)" for r in sorted_rows[:5] if r.price_momentum_1d]
    laggards = [f"{r.symbol} ({r.price_momentum_1d:.1f}%)"  for r in sorted_rows[-5:] if r.price_momentum_1d]

    return {
        "leaders":  ", ".join(leaders)  or "None",
        "laggards": ", ".join(laggards) or "None",
    }


def _extract_themes(content: str) -> list[str]:
    """
    Extract short keyword tags from Key Themes section.
    Bullet points can be long sentences — we trim to the first clause
    (up to first comma, colon, or dash) to get a short 2-5 word label.
    """
    themes = []
    in_themes = False
    for line in content.split("\n"):
        lower = line.lower()
        if "key theme" in lower or "themes today" in lower:
            in_themes = True
            continue
        if in_themes and line.startswith("##"):
            break
        if in_themes and line.strip().startswith(("-", "*", "•")):
            theme = line.strip().lstrip("-*•").strip()
            if not theme:
                continue
            # Trim to first meaningful phrase (before comma, colon, parenthesis)
            for sep in [" — ", " - ", ": ", ", ", " (", ";"]:
                if sep in theme:
                    theme = theme.split(sep)[0].strip()
                    break
            # Hard cap at 40 chars
            if len(theme) > 40:
                # Take first 4 words
                words = theme.split()
                theme = " ".join(words[:4])
            if len(theme) > 3:
                themes.append(theme)
    return themes[:6]


def _extract_regime(content: str) -> str:
    """Extract risk regime from briefing content."""
    content_lower = content.lower()
    if "risk-off" in content_lower or "risk off" in content_lower:
        return "risk-off"
    elif "risk-on" in content_lower or "risk on" in content_lower:
        return "risk-on"
    elif "transition" in content_lower:
        return "transition"
    return "neutral"
