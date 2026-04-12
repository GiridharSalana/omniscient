"""
Users Router — preferences, watchlist, market selections.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from main import get_db
from routers.auth import require_user

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Schemas ──────────────────────────────────────────────────────
class PreferencesUpdate(BaseModel):
    markets:     Optional[list[str]] = None   # ["india","americas","emea","asia","global"]
    watchlist:   Optional[list[str]] = None   # ["AAPL","NVDA",...]
    home_region: Optional[str]       = None   # "india" | "americas" | "emea" | "asia"
    theme:       Optional[str]       = None   # "dark" (only option for now)

class PreferencesOut(BaseModel):
    user_id:     int
    markets:     list[str]
    watchlist:   list[str]
    home_region: str
    theme:       str

# ── Endpoints ────────────────────────────────────────────────────
@router.get("/preferences", response_model=PreferencesOut)
async def get_preferences(
    current_user: dict    = Depends(require_user),
    db:           AsyncSession = Depends(get_db),
):
    row = await db.execute(
        text("SELECT * FROM user_preferences WHERE user_id = :uid"),
        {"uid": current_user["id"]},
    )
    prefs = row.fetchone()
    if not prefs:
        # Create defaults if missing
        await db.execute(
            text("INSERT INTO user_preferences (user_id) VALUES (:uid) ON CONFLICT DO NOTHING"),
            {"uid": current_user["id"]},
        )
        await db.commit()
        return PreferencesOut(
            user_id=current_user["id"],
            markets=["india", "americas", "emea", "asia"],
            watchlist=[],
            home_region="india",
            theme="dark",
        )

    d = dict(prefs._mapping)
    return PreferencesOut(
        user_id=d["user_id"],
        markets=d["markets"] if isinstance(d["markets"], list) else json.loads(d["markets"]),
        watchlist=d["watchlist"] if isinstance(d["watchlist"], list) else json.loads(d["watchlist"]),
        home_region=d["home_region"],
        theme=d["theme"],
    )


@router.put("/preferences", response_model=PreferencesOut)
async def update_preferences(
    body:         PreferencesUpdate,
    current_user: dict         = Depends(require_user),
    db:           AsyncSession = Depends(get_db),
):
    # Fetch current
    row = await db.execute(
        text("SELECT * FROM user_preferences WHERE user_id = :uid"),
        {"uid": current_user["id"]},
    )
    current = row.fetchone()
    if not current:
        raise HTTPException(404, "Preferences not found")

    d = dict(current._mapping)
    markets     = body.markets     if body.markets     is not None else d["markets"]
    watchlist   = body.watchlist   if body.watchlist   is not None else d["watchlist"]
    home_region = body.home_region if body.home_region is not None else d["home_region"]
    theme       = body.theme       if body.theme       is not None else d["theme"]

    await db.execute(
        text("""
            UPDATE user_preferences
            SET markets = :markets, watchlist = :watchlist,
                home_region = :home_region, theme = :theme, updated_at = NOW()
            WHERE user_id = :uid
        """),
        {
            "uid":         current_user["id"],
            "markets":     json.dumps(markets),
            "watchlist":   json.dumps(watchlist),
            "home_region": home_region,
            "theme":       theme,
        },
    )
    await db.commit()
    return PreferencesOut(
        user_id=current_user["id"],
        markets=markets,
        watchlist=watchlist,
        home_region=home_region,
        theme=theme,
    )


@router.get("/watchlist")
async def get_watchlist(
    current_user: dict    = Depends(require_user),
    db:           AsyncSession = Depends(get_db),
):
    """Return detailed watchlist items for the current user."""
    row = await db.execute(
        text("SELECT watchlist FROM user_preferences WHERE user_id = :uid"),
        {"uid": current_user["id"]},
    )
    prefs = row.fetchone()
    if not prefs:
        return []
    symbols = prefs.watchlist if isinstance(prefs.watchlist, list) else json.loads(prefs.watchlist or "[]")
    return {"symbols": symbols}
