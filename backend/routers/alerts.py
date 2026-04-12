"""
Alert System Router
Smart triggers: price levels, momentum breakouts, sentiment shifts, VIX spikes.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from models.schemas import AlertCreate, AlertResponse
from main import get_db, get_redis

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/", response_model=list[AlertResponse])
async def get_alerts(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
):
    """Get all configured alerts."""
    where = "WHERE is_active" if active_only else ""
    result = await db.execute(
        text(f"SELECT * FROM alerts {where} ORDER BY created_at DESC")
    )
    return [AlertResponse(**dict(r._mapping)) for r in result.fetchall()]


@router.post("/", response_model=AlertResponse, status_code=201)
async def create_alert(
    alert: AlertCreate,
    db:    AsyncSession = Depends(get_db),
):
    """Create a new alert trigger."""
    result = await db.execute(
        text("""
            INSERT INTO alerts (symbol, alert_type, threshold, condition)
            VALUES (:symbol, :alert_type, :threshold, CAST(:condition AS jsonb))
            RETURNING *
        """),
        {
            "symbol":     alert.symbol.upper() if alert.symbol else None,
            "alert_type": alert.alert_type,
            "threshold":  alert.threshold,
            "condition":  json.dumps(alert.condition),
        },
    )
    row = result.fetchone()
    await db.commit()
    return AlertResponse(**dict(row._mapping))


@router.delete("/{alert_id}")
async def delete_alert(alert_id: int, db: AsyncSession = Depends(get_db)):
    """Deactivate an alert."""
    await db.execute(
        text("UPDATE alerts SET is_active = false WHERE id = :id"),
        {"id": alert_id},
    )
    await db.commit()
    return {"message": "Alert deactivated"}


@router.post("/check")
async def check_alerts(
    db:    AsyncSession = Depends(get_db),
    redis             = Depends(get_redis),
):
    """
    Evaluate all active alerts against current market data.
    Triggered by scheduler every 5 minutes during market hours.
    """
    # Get active alerts
    result = await db.execute(
        text("SELECT * FROM alerts WHERE is_active AND triggered_at IS NULL")
    )
    alerts = result.fetchall()
    if not alerts:
        return {"triggered": 0}

    # Get cached market snapshot
    snapshot_raw = await redis.get("market:snapshot")
    if not snapshot_raw:
        return {"triggered": 0, "reason": "No market data available"}

    snapshot = json.loads(snapshot_raw)
    all_quotes = []
    for region in ("americas", "emea", "asia", "safe_havens"):
        all_quotes.extend(snapshot.get(region, []))
    by_sym = {q["symbol"]: q for q in all_quotes}

    triggered_count = 0
    for alert in alerts:
        alert_dict = dict(alert._mapping)
        fired, message = _evaluate_alert(alert_dict, by_sym, snapshot)

        if fired:
            await db.execute(
                text("""
                    UPDATE alerts SET triggered_at = NOW(), message = :msg
                    WHERE id = :id
                """),
                {"msg": message, "id": alert_dict["id"]},
            )
            # Publish to Redis for WebSocket push
            await redis.publish("alert_channel", json.dumps({
                "alert_id":  alert_dict["id"],
                "alert_type": alert_dict["alert_type"],
                "symbol":    alert_dict.get("symbol"),
                "message":   message,
                "ts":        datetime.now(timezone.utc).isoformat(),
            }))
            triggered_count += 1

    await db.commit()
    return {"triggered": triggered_count, "checked": len(alerts)}


@router.get("/triggered")
async def get_triggered_alerts(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    """Get recently triggered alerts."""
    result = await db.execute(
        text("""
            SELECT * FROM alerts
            WHERE triggered_at IS NOT NULL
            ORDER BY triggered_at DESC
            LIMIT :limit
        """),
        {"limit": limit},
    )
    return [AlertResponse(**dict(r._mapping)) for r in result.fetchall()]


# ── Alert evaluation logic ────────────────────────────────────────

def _evaluate_alert(alert: dict, by_sym: dict, snapshot: dict) -> tuple[bool, str]:
    """
    Evaluate one alert against current market data.
    Returns (fired, message).
    """
    atype     = alert["alert_type"]
    symbol    = alert.get("symbol")
    threshold = alert.get("threshold")
    condition = alert.get("condition", {})

    quote = by_sym.get(symbol, {}) if symbol else {}

    if atype == "price_above":
        price = quote.get("price")
        if price and threshold and price >= threshold:
            return True, f"{symbol} crossed above ${threshold:.2f} — now ${price:.2f}"

    elif atype == "price_below":
        price = quote.get("price")
        if price and threshold and price <= threshold:
            return True, f"{symbol} fell below ${threshold:.2f} — now ${price:.2f}"

    elif atype == "price_change_pct":
        chg_pct = quote.get("change_pct")
        if chg_pct is not None and threshold is not None:
            if abs(chg_pct) >= abs(threshold):
                direction = "surged" if chg_pct > 0 else "dropped"
                return True, f"{symbol} {direction} {abs(chg_pct):.1f}% (threshold: {abs(threshold):.1f}%)"

    elif atype == "vix_spike":
        vix_quote = by_sym.get("^VIX", {})
        vix_chg   = vix_quote.get("change_pct", 0) or 0
        vix_price = vix_quote.get("price", 15) or 15
        spike_threshold = threshold or 15
        if vix_chg >= spike_threshold or vix_price >= 30:
            return True, f"VIX spike alert: VIX at {vix_price:.1f} (+{vix_chg:.1f}%)"

    elif atype == "cross_asset":
        # Gold + USD both rising = safe haven flow (risk-off)
        gold_chg = by_sym.get("GC=F", {}).get("change_pct", 0) or 0
        usd_chg  = by_sym.get("DX-Y.NYB", {}).get("change_pct", 0) or 0
        if gold_chg > 0.8 and usd_chg > 0.4:
            return True, f"Risk-off signal: Gold +{gold_chg:.1f}% AND USD +{usd_chg:.1f}% — safe haven flows detected"

    elif atype == "sentiment_shift":
        regime = snapshot.get("risk_regime", "neutral")
        target_regime = condition.get("regime", "risk-off")
        if regime == target_regime:
            return True, f"Market regime shifted to {regime.upper()}"

    return False, ""
