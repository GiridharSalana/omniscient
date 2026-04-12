#!/usr/bin/env python3
"""
Price Ingestion — runs every 5 minutes.
Fetches quotes for all tracked indices + watchlist via Yahoo Finance.
"""
import os
import sys
import logging
from datetime import datetime, timezone

import httpx

logging.basicConfig(level=logging.INFO, format="%(asctime)s [prices] %(message)s")
logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8000")


def main():
    logger.info("Starting price ingestion...")
    try:
        resp = httpx.post(
            f"{BACKEND_URL}/api/v1/market/snapshot",
            timeout=60,
        )
        if resp.status_code in (200, 304):
            logger.info("Price snapshot refreshed successfully.")
        else:
            logger.warning("Snapshot returned %d: %s", resp.status_code, resp.text[:200])

        # Also refresh watchlist
        resp2 = httpx.get(f"{BACKEND_URL}/api/v1/market/watchlist", timeout=30)
        if resp2.status_code == 200:
            data = resp2.json()
            logger.info("Watchlist updated: %d symbols", len(data))

        # Check alerts
        httpx.post(f"{BACKEND_URL}/api/v1/alerts/check", timeout=30)
        logger.info("Alert check triggered.")

    except Exception as e:
        logger.error("Price ingestion failed: %s", e)
        sys.exit(1)

    logger.info("Price ingestion complete.")


if __name__ == "__main__":
    main()
