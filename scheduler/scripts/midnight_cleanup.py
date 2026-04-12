#!/usr/bin/env python3
"""
Midnight Cleanup — runs at 00:00 UTC daily.
Purges old data, archives to CSV, vacuums database.
"""
import os
import csv
import logging
import psycopg2
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO, format="%(asctime)s [cleanup] %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL   = os.getenv("DATABASE_URL", "postgresql://omniscient:omniscient_secret@postgres:5432/omniscient")
HISTORY_DAYS   = int(os.getenv("PRICE_HISTORY_DAYS", "365"))
ARCHIVE_DIR    = "/app/archives"

os.makedirs(ARCHIVE_DIR, exist_ok=True)


def main():
    logger.info("Starting midnight cleanup...")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    cur = conn.cursor()

    cutoff = datetime.utcnow() - timedelta(days=HISTORY_DAYS)

    # Archive old price data to CSV
    yesterday = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")
    archive_path = f"{ARCHIVE_DIR}/prices_{yesterday}.csv"
    try:
        cur.execute(
            "SELECT symbol, ts, open, high, low, close, volume FROM price_data WHERE ts < %s ORDER BY symbol, ts",
            (cutoff,),
        )
        rows = cur.fetchall()
        if rows:
            with open(archive_path, "w", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(["symbol", "ts", "open", "high", "low", "close", "volume"])
                writer.writerows(rows)
            logger.info("Archived %d price records to %s", len(rows), archive_path)
    except Exception as e:
        logger.warning("Archive failed: %s", e)

    # Delete old price data beyond retention window
    cur.execute("DELETE FROM price_data WHERE ts < %s", (cutoff,))
    logger.info("Purged price data older than %d days", HISTORY_DAYS)

    # Delete old news older than 30 days
    news_cutoff = datetime.utcnow() - timedelta(days=30)
    cur.execute("DELETE FROM news WHERE published_at < %s AND embedding IS NULL", (news_cutoff,))
    logger.info("Purged old unembedded news")

    # Delete old API usage logs (keep 90 days)
    api_cutoff = datetime.utcnow() - timedelta(days=90)
    cur.execute("DELETE FROM api_usage WHERE ts < %s", (api_cutoff,))

    # Delete old triggered alerts (keep 30 days)
    alert_cutoff = datetime.utcnow() - timedelta(days=30)
    cur.execute(
        "DELETE FROM alerts WHERE triggered_at IS NOT NULL AND triggered_at < %s",
        (alert_cutoff,),
    )

    # ANALYZE for query planner
    cur.execute("ANALYZE")
    logger.info("Database analyzed.")

    cur.close()
    conn.close()
    logger.info("Midnight cleanup complete.")


if __name__ == "__main__":
    main()
