"""
Portfolio Tracker Router
CRUD for holdings, live P&L, allocation, benchmark comparison.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from data_ingestion import DataIngestionEngine
from main import get_db, get_redis

logger = logging.getLogger(__name__)
router = APIRouter()
ingestion = DataIngestionEngine()


# ── Models ────────────────────────────────────────────────────────
class HoldingCreate(BaseModel):
    symbol:    str
    quantity:  float
    avg_price: float
    buy_date:  Optional[str] = None
    notes:     Optional[str] = None
    currency:  str = "INR"


class HoldingUpdate(BaseModel):
    quantity:  Optional[float] = None
    avg_price: Optional[float] = None
    notes:     Optional[str]   = None


class HoldingResponse(BaseModel):
    id:          int
    symbol:      str
    name:        Optional[str]
    quantity:    float
    avg_price:   float
    buy_date:    Optional[str]
    notes:       Optional[str]
    currency:    str
    created_at:  str

    # Live enrichment (added on fetch)
    current_price:  Optional[float] = None
    current_value:  Optional[float] = None
    invested_value: Optional[float] = None
    pnl:            Optional[float] = None
    pnl_pct:        Optional[float] = None
    day_change:     Optional[float] = None
    day_change_pct: Optional[float] = None


class PortfolioSummary(BaseModel):
    total_invested:    float
    total_current:     float
    total_pnl:         float
    total_pnl_pct:     float
    day_pnl:           float
    holdings_count:    int
    holdings:          list[HoldingResponse]
    sector_allocation: list[dict]
    updated_at:        str


# ── Table migration ───────────────────────────────────────────────
@router.post("/migrate")
async def migrate_portfolio_table(db: AsyncSession = Depends(get_db)):
    """Create portfolio_holdings table if it doesn't exist."""
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS portfolio_holdings (
            id          SERIAL PRIMARY KEY,
            symbol      TEXT NOT NULL,
            name        TEXT,
            quantity    NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
            avg_price   NUMERIC(18,4) NOT NULL CHECK (avg_price > 0),
            buy_date    DATE,
            notes       TEXT,
            currency    TEXT NOT NULL DEFAULT 'INR',
            is_active   BOOLEAN NOT NULL DEFAULT true,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))
    await db.execute(text(
        "CREATE INDEX IF NOT EXISTS idx_portfolio_symbol ON portfolio_holdings(symbol)"
    ))
    await db.commit()
    return {"status": "ok", "message": "portfolio_holdings table ready"}


# ── CRUD ─────────────────────────────────────────────────────────
@router.get("/", response_model=PortfolioSummary)
async def get_portfolio(
    db:    AsyncSession = Depends(get_db),
    redis             = Depends(get_redis),
):
    """Get all holdings with live prices and P&L."""
    # Fetch holdings from DB
    try:
        result = await db.execute(text("""
            SELECT id, symbol, name, quantity, avg_price, buy_date, notes, currency, created_at
            FROM portfolio_holdings
            WHERE is_active
            ORDER BY created_at DESC
        """))
        rows = result.fetchall()
    except Exception:
        return PortfolioSummary(
            total_invested=0, total_current=0, total_pnl=0, total_pnl_pct=0,
            day_pnl=0, holdings_count=0, holdings=[],
            sector_allocation=[], updated_at=datetime.now(timezone.utc).isoformat(),
        )

    if not rows:
        return PortfolioSummary(
            total_invested=0, total_current=0, total_pnl=0, total_pnl_pct=0,
            day_pnl=0, holdings_count=0, holdings=[],
            sector_allocation=[], updated_at=datetime.now(timezone.utc).isoformat(),
        )

    symbols = list({r.symbol for r in rows})

    # Fetch live quotes
    try:
        quotes = await ingestion.fetch_yahoo_quotes(symbols)
        by_sym = {q["symbol"]: q for q in quotes}
    except Exception:
        by_sym = {}

    holdings: list[HoldingResponse] = []
    total_invested = 0.0
    total_current  = 0.0
    day_pnl        = 0.0

    for row in rows:
        q = by_sym.get(row.symbol, {})
        qty   = float(row.quantity)
        avg_p = float(row.avg_price)
        cur_p = q.get("price")
        chg_p = q.get("change_pct")

        inv_val = qty * avg_p
        cur_val = qty * cur_p if cur_p else None
        pnl     = (cur_val - inv_val) if cur_val is not None else None
        pnl_pct = ((pnl / inv_val) * 100) if pnl is not None and inv_val > 0 else None
        day_chg_val = (cur_val * chg_p / 100) if cur_val and chg_p else None

        total_invested += inv_val
        if cur_val: total_current += cur_val
        if day_chg_val: day_pnl += day_chg_val

        holdings.append(HoldingResponse(
            id            = row.id,
            symbol        = row.symbol,
            name          = row.name,
            quantity      = qty,
            avg_price     = avg_p,
            buy_date      = str(row.buy_date) if row.buy_date else None,
            notes         = row.notes,
            currency      = row.currency,
            created_at    = str(row.created_at),
            current_price = round(cur_p, 2) if cur_p else None,
            current_value = round(cur_val, 2) if cur_val else None,
            invested_value= round(inv_val, 2),
            pnl           = round(pnl, 2) if pnl is not None else None,
            pnl_pct       = round(pnl_pct, 2) if pnl_pct is not None else None,
            day_change    = round(day_chg_val, 2) if day_chg_val else None,
            day_change_pct= round(chg_p, 2) if chg_p else None,
        ))

    total_pnl     = total_current - total_invested if total_current else 0
    total_pnl_pct = (total_pnl / total_invested * 100) if total_invested > 0 else 0

    # Sector allocation (by current value)
    sector_map: dict[str, float] = {}
    for h in holdings:
        sector = h.symbol.replace(".NS", "")[:6]  # simplified
        sector_map[sector] = sector_map.get(sector, 0) + (h.current_value or h.invested_value)
    sector_alloc = [
        {"symbol": s, "value": round(v, 2), "pct": round(v / max(total_current, 1) * 100, 1)}
        for s, v in sorted(sector_map.items(), key=lambda x: x[1], reverse=True)
    ]

    return PortfolioSummary(
        total_invested    = round(total_invested, 2),
        total_current     = round(total_current, 2),
        total_pnl         = round(total_pnl, 2),
        total_pnl_pct     = round(total_pnl_pct, 2),
        day_pnl           = round(day_pnl, 2),
        holdings_count    = len(holdings),
        holdings          = holdings,
        sector_allocation = sector_alloc,
        updated_at        = datetime.now(timezone.utc).isoformat(),
    )


@router.post("/holdings", response_model=HoldingResponse, status_code=201)
async def add_holding(
    body: HoldingCreate,
    db:   AsyncSession = Depends(get_db),
):
    """Add a new holding to the portfolio."""
    # Get name from Yahoo Finance
    name = body.symbol
    try:
        quotes = await ingestion.fetch_yahoo_quotes([body.symbol.upper()])
        if quotes:
            name = quotes[0].get("name", body.symbol)
    except Exception:
        pass

    result = await db.execute(text("""
        INSERT INTO portfolio_holdings (symbol, name, quantity, avg_price, buy_date, notes, currency)
        VALUES (:sym, :name, :qty, :avg_p, :buy_date, :notes, :currency)
        RETURNING id, symbol, name, quantity, avg_price, buy_date, notes, currency, created_at
    """), {
        "sym":      body.symbol.upper(),
        "name":     name[:120],
        "qty":      body.quantity,
        "avg_p":    body.avg_price,
        "buy_date": body.buy_date,
        "notes":    body.notes,
        "currency": body.currency,
    })
    row = result.fetchone()
    await db.commit()
    return HoldingResponse(
        id=row.id, symbol=row.symbol, name=row.name,
        quantity=float(row.quantity), avg_price=float(row.avg_price),
        buy_date=str(row.buy_date) if row.buy_date else None,
        notes=row.notes, currency=row.currency,
        created_at=str(row.created_at),
    )


@router.patch("/holdings/{holding_id}", response_model=HoldingResponse)
async def update_holding(
    holding_id: int,
    body: HoldingUpdate,
    db:   AsyncSession = Depends(get_db),
):
    """Update quantity or average price of a holding."""
    sets = []
    params: dict = {"id": holding_id}
    if body.quantity  is not None: sets.append("quantity = :qty");  params["qty"]   = body.quantity
    if body.avg_price is not None: sets.append("avg_price = :avg"); params["avg"]   = body.avg_price
    if body.notes     is not None: sets.append("notes = :notes");   params["notes"] = body.notes
    if not sets:
        raise HTTPException(400, "Nothing to update")
    sets.append("updated_at = NOW()")

    result = await db.execute(
        text(f"UPDATE portfolio_holdings SET {', '.join(sets)} WHERE id = :id RETURNING *"),
        params
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(404, "Holding not found")
    await db.commit()
    return HoldingResponse(
        id=row.id, symbol=row.symbol, name=row.name,
        quantity=float(row.quantity), avg_price=float(row.avg_price),
        buy_date=str(row.buy_date) if row.buy_date else None,
        notes=row.notes, currency=row.currency,
        created_at=str(row.created_at),
    )


@router.delete("/holdings/{holding_id}")
async def delete_holding(holding_id: int, db: AsyncSession = Depends(get_db)):
    """Remove a holding from the portfolio."""
    await db.execute(
        text("UPDATE portfolio_holdings SET is_active = false WHERE id = :id"),
        {"id": holding_id},
    )
    await db.commit()
    return {"message": "Holding removed"}
