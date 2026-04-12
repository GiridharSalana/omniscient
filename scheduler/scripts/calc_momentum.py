#!/usr/bin/env python3
"""
Momentum Recalculation — runs every 30 minutes.
Recalculates composite momentum scores for all tracked securities.
"""
import os
import logging
import httpx

logging.basicConfig(level=logging.INFO, format="%(asctime)s [momentum] %(message)s")
logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8000")


def main():
    logger.info("Starting momentum recalculation...")
    try:
        resp = httpx.post(
            f"{BACKEND_URL}/api/v1/momentum/recalculate",
            timeout=300,  # can take a few minutes for many symbols
        )
        if resp.status_code == 200:
            data = resp.json()
            logger.info("Momentum updated: %d/%d symbols",
                       data.get("recalculated", 0), data.get("total", 0))
        else:
            logger.warning("Momentum calc returned %d: %s", resp.status_code, resp.text[:200])
    except Exception as e:
        logger.error("Momentum recalculation failed: %s", e)


if __name__ == "__main__":
    main()
