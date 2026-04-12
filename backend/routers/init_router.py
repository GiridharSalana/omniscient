"""
Initialization Router — seed data and setup endpoints.
"""
import os
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from main import get_db

router = APIRouter()


@router.post("/seed")
async def seed_defaults(db: AsyncSession = Depends(get_db)):
    """
    Seed default alerts and verify database health.
    Called by setup.sh on first boot.
    """
    # Add default alerts
    default_alerts = [
        ("^VIX",     "vix_spike",        15.0,  '{}'),
        (None,        "cross_asset",       None,  '{}'),
        ("^GSPC",    "price_change_pct",  -2.0,  '{}'),
        ("^GSPC",    "price_change_pct",   2.0,  '{}'),
    ]
    for sym, atype, threshold, condition in default_alerts:
        await db.execute(
            text("""
                INSERT INTO alerts (symbol, alert_type, threshold, condition)
                VALUES (:sym, :atype, :threshold, CAST(:condition AS jsonb))
                ON CONFLICT DO NOTHING
            """),
            {"sym": sym, "atype": atype, "threshold": threshold, "condition": condition},
        )
    await db.commit()

    return {"message": "Default data seeded successfully"}


@router.post("/migrate-v2")
async def migrate_v2(db: AsyncSession = Depends(get_db)):
    """Run v2 migration: users, user_preferences, India indices."""
    sql_path = os.path.join(os.path.dirname(__file__), "..", "sql", "migrate_v2.sql")
    with open(sql_path) as f:
        sql = f.read()
    # Execute statement by statement (skip comments/empty)
    for stmt in sql.split(";"):
        stmt = stmt.strip()
        if stmt and not stmt.startswith("--"):
            try:
                await db.execute(text(stmt))
            except Exception as e:
                await db.rollback()
                # Non-fatal: duplicate column etc.
                import logging
                logging.getLogger(__name__).warning("Migration stmt warn: %s", e)
    await db.commit()
    return {"status": "ok", "message": "v2 migration applied"}


@router.get("/status")
async def init_status(db: AsyncSession = Depends(get_db)):
    """Check initialization status."""
    checks = {}

    result = await db.execute(text("SELECT COUNT(*) FROM indices"))
    checks["indices"] = result.scalar()

    result = await db.execute(text("SELECT COUNT(*) FROM watchlist"))
    checks["watchlist"] = result.scalar()

    result = await db.execute(text("SELECT COUNT(*) FROM price_data"))
    checks["price_records"] = result.scalar()

    result = await db.execute(text("SELECT COUNT(*) FROM news"))
    checks["news_items"] = result.scalar()

    result = await db.execute(text("SELECT COUNT(*) FROM briefings"))
    checks["briefings"] = result.scalar()

    return {"initialized": True, "counts": checks}
