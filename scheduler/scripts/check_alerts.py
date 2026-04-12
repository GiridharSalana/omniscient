#!/usr/bin/env python3
"""Alert checker — runs every 5 minutes."""
import os
import logging
import httpx

logging.basicConfig(level=logging.INFO, format="%(asctime)s [alerts] %(message)s")
logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8000")


def main():
    try:
        resp = httpx.post(f"{BACKEND_URL}/api/v1/alerts/check", timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("triggered", 0) > 0:
                logger.info("Alerts fired: %d", data["triggered"])
    except Exception as e:
        logger.error("Alert check failed: %s", e)


if __name__ == "__main__":
    main()
