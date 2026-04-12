"""
Omniscient Scheduler — Python-native, no system cron needed.
Uses APScheduler running inside Docker as a single Python process.

Schedule (all times IST = Asia/Kolkata):
  Every  5 min  — ingest prices + check alerts
  Every 10 min  — ingest news (sentiment + embeddings)
  Every 30 min  — recalculate momentum scores
  06:00 daily   — generate morning briefing (Mon–Fri)
  00:00 daily   — midnight cleanup + archive
"""
import logging
import os
import signal
import sys
import time

import httpx
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logging.basicConfig(
    level  = os.getenv("LOG_LEVEL", "INFO"),
    format = "%(asctime)s %(levelname)-8s [scheduler] %(message)s",
    datefmt= "%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8000")
TIMEZONE    = os.getenv("APP_TIMEZONE", "Asia/Kolkata")

# ─────────────────────────────────────────────────────────────────
# Job functions — each calls the corresponding backend endpoint
# ─────────────────────────────────────────────────────────────────

def _post(path: str, timeout: int = 60) -> dict:
    """POST to backend and return JSON response."""
    resp = httpx.post(f"{BACKEND_URL}{path}", timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def _get(path: str, timeout: int = 30) -> dict:
    resp = httpx.get(f"{BACKEND_URL}{path}", timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def job_ingest_prices():
    """Every 5 min — refresh market snapshot and watchlist quotes."""
    try:
        _get("/api/v1/market/snapshot", timeout=60)
        _get("/api/v1/market/watchlist", timeout=30)
        logger.info("Prices refreshed.")
    except Exception as e:
        logger.warning("Price ingestion failed: %s", e)


def job_check_alerts():
    """Every 5 min — evaluate active alert conditions."""
    try:
        data = _post("/api/v1/alerts/check", timeout=30)
        fired = data.get("triggered", 0)
        if fired:
            logger.info("Alerts fired: %d", fired)
    except Exception as e:
        logger.warning("Alert check failed: %s", e)


def job_ingest_news():
    """Every 10 min — fetch news, run sentiment + embeddings pipeline."""
    try:
        data = _post("/api/v1/news/ingest", timeout=120)
        logger.info("News ingested: %d inserted (of %d fetched)",
                    data.get("inserted", 0), data.get("total_fetched", 0))
    except Exception as e:
        logger.warning("News ingestion failed: %s", e)


def job_calc_momentum():
    """Every 30 min — recalculate momentum scores for all symbols."""
    try:
        data = _post("/api/v1/momentum/recalculate", timeout=300)
        logger.info("Momentum updated: %d/%d symbols",
                    data.get("recalculated", 0), data.get("total", 0))
    except Exception as e:
        logger.warning("Momentum recalculation failed: %s", e)


def job_morning_briefing():
    """06:00 IST Mon–Fri — generate AI morning briefing."""
    import datetime
    today = datetime.date.today()
    # Skip weekends
    if today.weekday() >= 5:
        logger.info("Weekend — skipping morning briefing.")
        return
    try:
        data = _post("/api/v1/briefing/generate", timeout=180)
        logger.info("Morning briefing generated via %s for %s",
                    data.get("provider", "?"), data.get("briefing_date", "?"))
        _send_telegram(data.get("content", ""))
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 409:
            logger.info("Briefing already exists for today — skipped.")
        else:
            logger.error("Briefing generation failed: %s", e)
    except Exception as e:
        logger.error("Briefing generation error: %s", e)


def job_midnight_cleanup():
    """00:00 daily — archive old data and vacuum database."""
    try:
        import psycopg2
        import csv
        import datetime

        db_url  = os.getenv("DATABASE_URL", "postgresql://omniscient:omniscient_secret@postgres:5432/omniscient")
        history = int(os.getenv("PRICE_HISTORY_DAYS", "365"))
        cutoff  = datetime.datetime.utcnow() - datetime.timedelta(days=history)
        archive_dir = "/app/archives"
        os.makedirs(archive_dir, exist_ok=True)

        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cur  = conn.cursor()

        # Archive then purge old prices
        yesterday = (datetime.datetime.utcnow() - datetime.timedelta(days=1)).strftime("%Y-%m-%d")
        cur.execute(
            "SELECT symbol, ts, open, high, low, close, volume FROM price_data WHERE ts < %s ORDER BY symbol, ts",
            (cutoff,),
        )
        rows = cur.fetchall()
        if rows:
            path = f"{archive_dir}/prices_{yesterday}.csv"
            with open(path, "w", newline="") as f:
                csv.writer(f).writerows([["symbol","ts","open","high","low","close","volume"]] + rows)
            logger.info("Archived %d rows to %s", len(rows), path)

        cur.execute("DELETE FROM price_data WHERE ts < %s", (cutoff,))
        cur.execute("DELETE FROM news WHERE published_at < NOW() - INTERVAL '30 days' AND embedding IS NULL")
        cur.execute("DELETE FROM api_usage WHERE ts < NOW() - INTERVAL '90 days'")
        cur.execute("DELETE FROM alerts WHERE triggered_at IS NOT NULL AND triggered_at < NOW() - INTERVAL '30 days'")
        cur.execute("ANALYZE")

        cur.close()
        conn.close()
        logger.info("Midnight cleanup complete.")
    except Exception as e:
        logger.error("Midnight cleanup failed: %s", e)


def _send_telegram(content: str):
    """Optional Telegram notification for morning briefing."""
    token   = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        return
    try:
        httpx.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": f"📊 *Omniscient Briefing*\n\n{content[:3000]}", "parse_mode": "Markdown"},
            timeout=15,
        )
        logger.info("Telegram notification sent.")
    except Exception as e:
        logger.warning("Telegram send failed: %s", e)


# ─────────────────────────────────────────────────────────────────
# Wait for backend to be healthy before starting jobs
# ─────────────────────────────────────────────────────────────────

def wait_for_backend(retries: int = 30, delay: int = 5):
    logger.info("Waiting for backend at %s ...", BACKEND_URL)
    for attempt in range(1, retries + 1):
        try:
            resp = httpx.get(f"{BACKEND_URL}/health", timeout=5)
            if resp.status_code == 200:
                logger.info("Backend is ready.")
                return
        except Exception:
            pass
        logger.info("Backend not ready (%d/%d) — retrying in %ds...", attempt, retries, delay)
        time.sleep(delay)
    logger.error("Backend did not become healthy after %d attempts. Exiting.", retries)
    sys.exit(1)


# ─────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────

def main():
    wait_for_backend()

    scheduler = BlockingScheduler(timezone=TIMEZONE)

    # Every 5 minutes — prices + alerts
    scheduler.add_job(
        job_ingest_prices,
        IntervalTrigger(minutes=5, timezone=TIMEZONE),
        id="ingest_prices", name="Ingest Prices",
        max_instances=1, coalesce=True,
    )
    scheduler.add_job(
        job_check_alerts,
        IntervalTrigger(minutes=5, timezone=TIMEZONE),
        id="check_alerts", name="Check Alerts",
        max_instances=1, coalesce=True,
    )

    # Every 10 minutes — news pipeline
    scheduler.add_job(
        job_ingest_news,
        IntervalTrigger(minutes=10, timezone=TIMEZONE),
        id="ingest_news", name="Ingest News",
        max_instances=1, coalesce=True,
    )

    # Every 30 minutes — momentum recalculation
    scheduler.add_job(
        job_calc_momentum,
        IntervalTrigger(minutes=30, timezone=TIMEZONE),
        id="calc_momentum", name="Momentum Recalculate",
        max_instances=1, coalesce=True,
    )

    # 06:00 IST daily — morning briefing
    scheduler.add_job(
        job_morning_briefing,
        CronTrigger(hour=6, minute=0, timezone=TIMEZONE),
        id="morning_briefing", name="Morning Briefing",
        max_instances=1,
    )

    # 00:00 IST daily — cleanup
    scheduler.add_job(
        job_midnight_cleanup,
        CronTrigger(hour=0, minute=0, timezone=TIMEZONE),
        id="midnight_cleanup", name="Midnight Cleanup",
        max_instances=1,
    )

    # Graceful shutdown on SIGTERM / SIGINT
    def _shutdown(signum, frame):
        logger.info("Shutdown signal received — stopping scheduler.")
        scheduler.shutdown(wait=False)
        sys.exit(0)

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT,  _shutdown)

    logger.info("Scheduler started (timezone: %s). Jobs:", TIMEZONE)
    for job in scheduler.get_jobs():
        logger.info("  %-25s %s", job.name, job.trigger)

    scheduler.start()


if __name__ == "__main__":
    main()
