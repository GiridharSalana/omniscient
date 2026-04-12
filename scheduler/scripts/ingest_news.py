#!/usr/bin/env python3
"""
News Ingestion — runs every 10 minutes.
Fetches news from Finnhub + MarketAux, runs sentiment + embeddings pipeline.
"""
import os
import logging
import httpx

logging.basicConfig(level=logging.INFO, format="%(asctime)s [news] %(message)s")
logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8000")


def main():
    logger.info("Starting news ingestion...")
    try:
        resp = httpx.post(
            f"{BACKEND_URL}/api/v1/news/ingest",
            timeout=120,
        )
        if resp.status_code == 200:
            data = resp.json()
            logger.info("News ingestion: %d inserted (from %d fetched)",
                       data.get("inserted", 0), data.get("total_fetched", 0))
        else:
            logger.warning("News ingest returned %d: %s", resp.status_code, resp.text[:200])
    except Exception as e:
        logger.error("News ingestion failed: %s", e)


if __name__ == "__main__":
    main()
