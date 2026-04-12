"""
Trading Journal Router
Log trades, track P&L, get AI-generated post-trade reviews.
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from llm_router import LLMRouter, TaskType
from models.schemas import JournalCreate, JournalEntry, JournalUpdate
from main import get_db, get_llm

logger = logging.getLogger(__name__)
router = APIRouter()

AI_REVIEW_PROMPT = """As a trading coach, provide a brief post-trade review for this journal entry:
Symbol: {symbol} | Action: {action} | Strategy: {strategy}
Entry Price: {entry} | Exit Price: {exit} | P&L: {pnl}%
Trader's Rationale: {rationale}
Trader's Emotion: {emotion}
Lessons Learned: {lessons}

Provide:
1. What went well / what went wrong (1-2 sentences)
2. Was the strategy executed correctly? (1 sentence)
3. Key lesson for next time (1 sentence)
4. Pattern recognition: does this match any common behavioral bias? (1 sentence)
Keep total response under 150 words."""


@router.get("/", response_model=list[JournalEntry])
async def get_journal(
    limit:        int            = Query(50, ge=1, le=500),
    offset:       int            = Query(0, ge=0),
    symbol:       Optional[str]  = None,
    strategy_tag: Optional[str]  = None,
    action:       Optional[str]  = None,
    db:           AsyncSession   = Depends(get_db),
):
    """Get journal entries with optional filtering."""
    filters = ["1=1"]
    params: dict = {"limit": limit, "offset": offset}

    if symbol:
        filters.append("symbol = :symbol")
        params["symbol"] = symbol.upper()
    if strategy_tag:
        filters.append("strategy_tag ILIKE :strategy")
        params["strategy"] = f"%{strategy_tag}%"
    if action:
        filters.append("action = :action")
        params["action"] = action.lower()

    where = " AND ".join(filters)
    result = await db.execute(
        text(f"""
            SELECT * FROM journal
            WHERE {where}
            ORDER BY trade_date DESC, created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    rows = result.fetchall()
    return [JournalEntry(**dict(r._mapping)) for r in rows]


@router.post("/", response_model=JournalEntry, status_code=201)
async def create_journal_entry(
    entry: JournalCreate,
    db:    AsyncSession = Depends(get_db),
):
    """Log a new trade in the journal."""
    total_value = None
    if entry.quantity and entry.price:
        total_value = round(entry.quantity * entry.price, 2)
        if entry.action in ("sell", "short"):
            total_value = -total_value

    result = await db.execute(
        text("""
            INSERT INTO journal (trade_date, symbol, action, quantity, price, total_value,
                                strategy_tag, rationale, emotion)
            VALUES (:trade_date, :symbol, :action, :quantity, :price, :total_value,
                    :strategy_tag, :rationale, :emotion)
            RETURNING *
        """),
        {
            "trade_date":   entry.trade_date,
            "symbol":       entry.symbol.upper(),
            "action":       entry.action.lower(),
            "quantity":     entry.quantity,
            "price":        entry.price,
            "total_value":  total_value,
            "strategy_tag": entry.strategy_tag,
            "rationale":    entry.rationale,
            "emotion":      entry.emotion,
        },
    )
    row = result.fetchone()
    await db.commit()
    return JournalEntry(**dict(row._mapping))


@router.patch("/{entry_id}", response_model=JournalEntry)
async def update_journal_entry(
    entry_id: int,
    update:   JournalUpdate,
    db:       AsyncSession = Depends(get_db),
    llm:      LLMRouter    = Depends(get_llm),
):
    """Update a journal entry (add exit, lessons). Triggers AI review if exit is added."""
    existing = await db.execute(
        text("SELECT * FROM journal WHERE id = :id"),
        {"id": entry_id},
    )
    row = existing.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Journal entry not found")

    entry = dict(row._mapping)

    pnl = None
    pnl_pct = None
    if update.exit_price and entry.get("price"):
        raw_pnl = update.exit_price - entry["price"]
        if entry.get("action") in ("sell", "short"):
            raw_pnl = -raw_pnl
        pnl = round(raw_pnl * (entry.get("quantity") or 1), 2)
        pnl_pct = round(raw_pnl / entry["price"] * 100, 4) if entry["price"] else None

    # Generate AI review when exit is added
    ai_review = update.ai_review
    if update.exit_price and not ai_review:
        try:
            prompt = AI_REVIEW_PROMPT.format(
                symbol    = entry["symbol"],
                action    = entry["action"],
                strategy  = entry.get("strategy_tag", "unspecified"),
                entry     = entry.get("price", "?"),
                exit      = update.exit_price,
                pnl       = f"{pnl_pct:+.1f}" if pnl_pct else "?",
                rationale = entry.get("rationale", "none provided"),
                emotion   = entry.get("emotion", "neutral"),
                lessons   = update.lessons_learned or "none yet",
            )
            ai_review, _ = await llm.complete(
                prompt    = prompt,
                task_type = TaskType.SUMMARIZE,
                max_tokens= 200,
            )
        except Exception as e:
            logger.warning("AI review failed: %s", e)

    result = await db.execute(
        text("""
            UPDATE journal SET
                exit_price      = COALESCE(:exit_price, exit_price),
                exit_date       = COALESCE(:exit_date, exit_date),
                pnl             = COALESCE(:pnl, pnl),
                pnl_percent     = COALESCE(:pnl_pct, pnl_percent),
                ai_review       = COALESCE(:ai_review, ai_review),
                lessons_learned = COALESCE(:lessons, lessons_learned),
                updated_at      = NOW()
            WHERE id = :id
            RETURNING *
        """),
        {
            "exit_price": update.exit_price,
            "exit_date":  update.exit_date,
            "pnl":        pnl,
            "pnl_pct":    pnl_pct,
            "ai_review":  ai_review,
            "lessons":    update.lessons_learned,
            "id":         entry_id,
        },
    )
    updated = result.fetchone()
    await db.commit()
    return JournalEntry(**dict(updated._mapping))


@router.get("/stats/summary")
async def get_journal_stats(db: AsyncSession = Depends(get_db)):
    """Aggregate P&L and performance statistics."""
    result = await db.execute(
        text("""
            SELECT
                COUNT(*) FILTER (WHERE exit_price IS NOT NULL) as closed_trades,
                COUNT(*) FILTER (WHERE exit_price IS NULL)     as open_trades,
                SUM(pnl) FILTER (WHERE pnl > 0)               as gross_profit,
                SUM(pnl) FILTER (WHERE pnl < 0)               as gross_loss,
                AVG(pnl_percent) FILTER (WHERE pnl_percent > 0) as avg_win_pct,
                AVG(pnl_percent) FILTER (WHERE pnl_percent < 0) as avg_loss_pct,
                COUNT(*) FILTER (WHERE pnl > 0)               as winners,
                COUNT(*) FILTER (WHERE pnl < 0)               as losers,
                MAX(strategy_tag)                              as top_strategy,
                mode() WITHIN GROUP (ORDER BY emotion)         as most_common_emotion
            FROM journal
        """)
    )
    row = result.fetchone()
    if not row:
        return {}

    data = dict(row._mapping)
    closed = data.get("closed_trades") or 0
    winners = data.get("winners") or 0
    data["win_rate"] = round(winners / closed * 100, 1) if closed > 0 else 0
    data["net_pnl"]  = round((data.get("gross_profit") or 0) + (data.get("gross_loss") or 0), 2)

    return data


@router.get("/patterns")
async def get_trading_patterns(
    db:  AsyncSession = Depends(get_db),
    llm: LLMRouter    = Depends(get_llm),
):
    """AI-powered pattern recognition across journal history."""
    result = await db.execute(
        text("""
            SELECT symbol, action, strategy_tag, emotion,
                   pnl_percent, exit_price IS NOT NULL as is_closed
            FROM journal
            ORDER BY created_at DESC
            LIMIT 50
        """)
    )
    rows = result.fetchall()
    if len(rows) < 5:
        return {"patterns": "Not enough trade history yet. Log at least 5 trades."}

    trades_str = "\n".join(
        f"- {r.symbol} {r.action} | {r.strategy_tag or 'no strategy'} | emotion: {r.emotion or '?'} | pnl: {f'{r.pnl_percent:+.1f}%' if r.pnl_percent else 'open'}"
        for r in rows
    )

    try:
        prompt = f"""Analyze these trades from my journal and identify behavioral patterns:
{trades_str}

Identify:
1. Most profitable strategy tag (if any)
2. Emotional bias patterns (FOMO, fear, overconfidence?)
3. Common mistakes
4. One concrete recommendation to improve
Keep response under 200 words."""
        patterns, provider = await llm.complete(
            prompt    = prompt,
            task_type = TaskType.SUMMARIZE,
            max_tokens= 300,
        )
        return {"patterns": patterns, "provider": provider, "trades_analyzed": len(rows)}
    except Exception as e:
        return {"patterns": f"Pattern analysis unavailable: {e}"}
