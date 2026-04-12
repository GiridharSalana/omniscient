#!/usr/bin/env python3
"""
Morning Briefing Generator — runs at 6 AM IST (00:30 UTC) on weekdays.
Generates AI market briefing via Cohere and optionally sends Telegram notification.
"""
import os
import logging
from datetime import date

import httpx

logging.basicConfig(level=logging.INFO, format="%(asctime)s [briefing] %(message)s")
logger = logging.getLogger(__name__)

BACKEND_URL         = os.getenv("BACKEND_URL", "http://backend:8000")
TELEGRAM_BOT_TOKEN  = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID    = os.getenv("TELEGRAM_CHAT_ID", "")


def send_telegram(message: str):
    """Send briefing excerpt to Telegram."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return
    try:
        excerpt = message[:3000]  # Telegram limit is 4096 chars
        httpx.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={
                "chat_id":    TELEGRAM_CHAT_ID,
                "text":       f"📊 *Omniscient Morning Briefing*\n\n{excerpt}",
                "parse_mode": "Markdown",
            },
            timeout=15,
        )
        logger.info("Telegram notification sent.")
    except Exception as e:
        logger.warning("Telegram send failed: %s", e)


def main():
    today = date.today()
    logger.info("Generating morning briefing for %s...", today)

    try:
        resp = httpx.post(
            f"{BACKEND_URL}/api/v1/briefing/generate",
            timeout=180,
        )
        if resp.status_code == 200:
            data = resp.json()
            logger.info("Briefing generated via %s", data.get("provider", "?"))
            send_telegram(data.get("content", ""))
        elif resp.status_code == 409:
            logger.info("Briefing for %s already exists — skipping.", today)
        else:
            logger.error("Briefing generation failed %d: %s", resp.status_code, resp.text[:300])
    except Exception as e:
        logger.error("Briefing generation error: %s", e)


if __name__ == "__main__":
    main()
