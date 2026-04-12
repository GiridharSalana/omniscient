"""
Data Ingestion Engine
Primary: Finnhub (60 calls/min) for real-time quotes via ETF proxies
Fallback: Alpha Vantage (25/day) for supplemental data
News:     MarketAux (250/day) + Finnhub news
Macro:    FRED (unlimited)

Yahoo Finance (yfinance) is BLOCKED by 429 rate-limit from server IPs.
We use ETF proxies for global indices — liquid, accurate, Finnhub-supported.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

ALPHA_VANTAGE_KEY = os.getenv("ALPHA_VANTAGE_KEY", "")
FINNHUB_KEY       = os.getenv("FINNHUB_KEY", "")
MARKETAUX_KEY     = os.getenv("MARKETAUX_KEY", "")
FRED_API_KEY      = os.getenv("FRED_API_KEY", "")

# ─────────────────────────────────────────────────────────────────
# Symbol mapping: our canonical symbol → Finnhub-compatible ETF proxy
# ─────────────────────────────────────────────────────────────────
SYMBOL_MAP: dict[str, dict] = {
    # Americas
    "^GSPC":     {"etf": "SPY",   "name": "S&P 500",          "currency": "USD", "region": "americas",   "asset_class": "equity"},
    "^IXIC":     {"etf": "QQQ",   "name": "NASDAQ 100",        "currency": "USD", "region": "americas",   "asset_class": "equity"},
    "^DJI":      {"etf": "DIA",   "name": "Dow Jones",         "currency": "USD", "region": "americas",   "asset_class": "equity"},
    "^RUT":      {"etf": "IWM",   "name": "Russell 2000",      "currency": "USD", "region": "americas",   "asset_class": "equity"},
    "^BVSP":     {"etf": "EWZ",   "name": "Bovespa (Brazil)",  "currency": "USD", "region": "americas",   "asset_class": "equity"},
    "^MXX":      {"etf": "EWW",   "name": "IPC Mexico",        "currency": "USD", "region": "americas",   "asset_class": "equity"},
    # EMEA
    "^FTSE":     {"etf": "EWU",   "name": "FTSE 100",          "currency": "USD", "region": "emea",       "asset_class": "equity"},
    "^GDAXI":    {"etf": "EWG",   "name": "DAX 40",            "currency": "USD", "region": "emea",       "asset_class": "equity"},
    "^FCHI":     {"etf": "EWQ",   "name": "CAC 40",            "currency": "USD", "region": "emea",       "asset_class": "equity"},
    "^STOXX50E": {"etf": "VGK",   "name": "Euro STOXX 50",     "currency": "USD", "region": "emea",       "asset_class": "equity"},
    "^AEX":      {"etf": "EWN",   "name": "AEX Amsterdam",     "currency": "USD", "region": "emea",       "asset_class": "equity"},
    # Asia-Pacific
    "^N225":     {"etf": "EWJ",   "name": "Nikkei 225",        "currency": "USD", "region": "asia",       "asset_class": "equity"},
    "^HSI":      {"etf": "EWH",   "name": "Hang Seng",         "currency": "USD", "region": "asia",       "asset_class": "equity"},
    "000001.SS": {"etf": "FXI",   "name": "Shanghai",          "currency": "USD", "region": "asia",       "asset_class": "equity"},
    "^AXJO":     {"etf": "EWA",   "name": "ASX 200",           "currency": "USD", "region": "asia",       "asset_class": "equity"},
    "^KS11":     {"etf": "EWY",   "name": "KOSPI",             "currency": "USD", "region": "asia",       "asset_class": "equity"},
    "^NSEI":     {"etf": "INDA",  "name": "NIFTY 50",          "currency": "USD", "region": "asia",       "asset_class": "equity"},
    # India markets (ETF proxies for Finnhub quotes)
    "^BSESN":    {"etf": "INDA",  "name": "BSE SENSEX",         "currency": "INR", "region": "india",      "asset_class": "equity"},
    "^NSEBANK":  {"etf": "IBB",   "name": "NIFTY Bank",         "currency": "INR", "region": "india",      "asset_class": "equity"},
    "^CNXIT":    {"etf": "INFY",  "name": "NIFTY IT",           "currency": "INR", "region": "india",      "asset_class": "equity"},
    "^INDIAVIX": {"etf": "VIXY",  "name": "India VIX",          "currency": "INR", "region": "india",      "asset_class": "volatility"},
    "USDINR=X":  {"etf": "UUP",   "name": "USD/INR",            "currency": "INR", "region": "india",      "asset_class": "fx"},
    # Safe Havens / Global
    "GC=F":      {"etf": "GLD",   "name": "Gold",              "currency": "USD", "region": "safe_havens","asset_class": "commodity"},
    "^VIX":      {"etf": "VIXY",  "name": "VIX (Fear Index)",  "currency": "USD", "region": "safe_havens","asset_class": "volatility"},
    "DX-Y.NYB":  {"etf": "UUP",   "name": "US Dollar Index",   "currency": "USD", "region": "safe_havens","asset_class": "fx"},
    "^TNX":      {"etf": "TLT",   "name": "US 10Y Treasury",   "currency": "USD", "region": "safe_havens","asset_class": "bond"},
    "CL=F":      {"etf": "USO",   "name": "Crude Oil WTI",     "currency": "USD", "region": "safe_havens","asset_class": "commodity"},
    "SI=F":      {"etf": "SLV",   "name": "Silver",            "currency": "USD", "region": "safe_havens","asset_class": "commodity"},
}

# For watchlist stocks — fetch directly by symbol via Finnhub
# (no mapping needed, Finnhub supports US equities natively)


class DataIngestionEngine:
    """Central data ingestion hub with quota-aware routing."""

    def __init__(self, redis_client=None):
        self._redis = redis_client

    # ─────────────────────────────────────────────────────────────
    # Finnhub — primary real-time quote source (60 calls/min)
    # ─────────────────────────────────────────────────────────────

    async def fetch_finnhub_quote(self, symbol: str) -> Optional[dict]:
        """Fetch a single quote from Finnhub."""
        if not FINNHUB_KEY:
            return None
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://finnhub.io/api/v1/quote",
                params={"symbol": symbol, "token": FINNHUB_KEY},
            )
            resp.raise_for_status()
            d = resp.json()
        if not d.get("c"):
            return None
        return {
            "price":      round(float(d["c"]),  4),
            "prev_close": round(float(d["pc"]), 4),
            "change":     round(float(d["d"]) if d.get("d") else float(d["c"]) - float(d["pc"]), 4),
            "change_pct": round(float(d["dp"]) if d.get("dp") else (float(d["c"]) - float(d["pc"])) / float(d["pc"]) * 100, 4),
            "high":       round(float(d.get("h", d["c"])), 4),
            "low":        round(float(d.get("l",  d["c"])), 4),
            "ts":         datetime.fromtimestamp(d.get("t", 0), tz=timezone.utc) if d.get("t") else datetime.now(timezone.utc),
        }

    async def _fetch_yahoo_chart_quote(self, sym: str) -> Optional[dict]:
        """Fetch real-time quote from Yahoo Finance v8 chart API."""
        try:
            async with httpx.AsyncClient(
                timeout=8,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
            ) as client:
                r = await client.get(
                    f"https://query2.finance.yahoo.com/v8/finance/chart/{sym}",
                    params={"interval": "1d", "range": "1d"},
                )
                r.raise_for_status()
                data   = r.json()
                meta   = (data.get("chart", {}).get("result") or [None])[0]
                if not meta:
                    return None
                m = meta.get("meta", {})
                prev  = m.get("chartPreviousClose") or m.get("regularMarketPreviousClose") or m.get("regularMarketPrice")
                price = m.get("regularMarketPrice") or m.get("fiftyTwoWeekHigh")
                if not price:
                    return None
                chg   = price - prev if prev else 0
                chg_pct = (chg / prev * 100) if prev else 0
                return {
                    "price":      round(float(price), 4),
                    "prev_close": round(float(prev or price), 4),
                    "change":     round(float(chg), 4),
                    "change_pct": round(float(chg_pct), 4),
                    "high":       round(float(m.get("regularMarketDayHigh") or price), 4),
                    "low":        round(float(m.get("regularMarketDayLow") or price), 4),
                    "ts":         datetime.now(timezone.utc),
                    "name":       m.get("shortName") or m.get("longName") or sym,
                }
        except Exception as e:
            logger.debug("Yahoo chart quote failed for %s: %s", sym, e)
            return None

    async def fetch_quotes(self, symbols: list[str]) -> list[dict]:
        """
        Fetch quotes for canonical symbols (e.g. ^GSPC, AAPL).
        - India and .NS symbols: direct Yahoo Finance chart API
        - Other indices: Finnhub ETF proxies
        - Plain stocks: Finnhub directly
        Rate-limited to avoid hitting Finnhub's 60/min cap.
        """
        results = []
        delay = 0.15  # ~6-7 per second → well under 60/min

        # Symbols to use Yahoo Finance for (India indices, forex pairs, etc.)
        yahoo_direct = {'^NSEI', '^BSESN', '^NSEBANK', '^CNXIT', '^INDIAVIX', 'USDINR=X'}

        for sym in symbols:
            mapping   = SYMBOL_MAP.get(sym)
            use_yahoo = sym in yahoo_direct or sym.endswith('.NS') or sym.endswith('.BO')

            try:
                if use_yahoo:
                    quote = await self._fetch_yahoo_chart_quote(sym)
                    if quote:
                        meta = mapping or {}
                        results.append({
                            "symbol":      sym,
                            "name":        quote.pop("name", None) or meta.get("name", sym),
                            "region":      meta.get("region", "india"),
                            "asset_class": meta.get("asset_class", "equity"),
                            "currency":    meta.get("currency", "INR"),
                            **quote,
                        })
                else:
                    fetch_sym = mapping["etf"] if mapping else sym
                    quote = await self.fetch_finnhub_quote(fetch_sym)
                    if quote:
                        meta = mapping or {"name": sym, "region": "global", "asset_class": "equity", "currency": "USD"}
                        results.append({
                            "symbol":     sym,
                            "name":       meta.get("name", sym),
                            "region":     meta.get("region", "global"),
                            "asset_class":meta.get("asset_class", "equity"),
                            "currency":   meta.get("currency", "USD"),
                            **quote,
                        })
            except Exception as e:
                logger.warning("Quote failed for %s: %s", sym, e)

            await asyncio.sleep(delay)

        logger.info("Fetched %d/%d quotes", len(results), len(symbols))
        return results

    # Keep old name for backward compatibility
    async def fetch_yahoo_quotes(self, symbols: list[str]) -> list[dict]:
        return await self.fetch_quotes(symbols)

    # ─────────────────────────────────────────────────────────────
    # Historical bars — Finnhub candles (free tier: 1 year)
    # ─────────────────────────────────────────────────────────────

    async def fetch_yahoo_history(
        self,
        symbol:   str,
        period:   str = "1y",
        interval: str = "1d",
    ) -> list[dict]:
        """
        Fetch OHLCV daily history via Alpha Vantage (free: 25 calls/day).
        Finnhub stock candles are premium-only on the free tier.
        Falls back to empty list on quota exhaustion.
        """
        if not ALPHA_VANTAGE_KEY:
            return []

        mapping   = SYMBOL_MAP.get(symbol)
        fetch_sym = mapping["etf"] if mapping else symbol

        # Map period to number of bars needed
        period_days = {
            "1d": 1, "5d": 5, "1mo": 30, "3mo": 90,
            "6mo": 180, "1y": 365, "2y": 730, "5y": 1825, "max": 1825,
        }
        days_needed = period_days.get(period, 365)
        # Alpha Vantage free tier: compact only (100 days). full requires premium.
        # 100 days is sufficient for all momentum periods (1d/1w/1m/3m).
        outputsize = "compact"

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    "https://www.alphavantage.co/query",
                    params={
                        "function":   "TIME_SERIES_DAILY",
                        "symbol":     fetch_sym,
                        "outputsize": outputsize,
                        "apikey":     ALPHA_VANTAGE_KEY,
                    },
                )
                resp.raise_for_status()
                data = resp.json()

            if "Time Series (Daily)" not in data:
                # API rate limit or invalid symbol
                note = data.get("Note") or data.get("Information") or str(data)[:100]
                logger.warning("Alpha Vantage history unavailable for %s: %s", symbol, note)
                return []

            series = data["Time Series (Daily)"]
            cutoff = datetime.now(timezone.utc) - timedelta(days=days_needed)

            bars = []
            for date_str in sorted(series.keys()):
                dt = datetime.fromisoformat(date_str).replace(tzinfo=timezone.utc)
                if dt < cutoff:
                    continue
                d = series[date_str]
                bars.append({
                    "symbol":    symbol,
                    "ts":        dt,
                    "open":      round(float(d["1. open"]), 4),
                    "high":      round(float(d["2. high"]), 4),
                    "low":       round(float(d["3. low"]), 4),
                    "close":     round(float(d["4. close"]), 4),
                    "volume":    int(d["5. volume"]),
                    "adj_close": round(float(d["4. close"]), 4),
                })
            logger.info("Alpha Vantage history: %d bars for %s (mapped: %s)", len(bars), symbol, fetch_sym)
            return bars

        except Exception as e:
            logger.error("Alpha Vantage history error for %s: %s", symbol, e)
            return []

    # ─────────────────────────────────────────────────────────────
    # Finnhub — news (60 calls/min)
    # ─────────────────────────────────────────────────────────────

    async def fetch_finnhub_news(self, category: str = "general", min_id: int = 0) -> list[dict]:
        if not FINNHUB_KEY:
            return []
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://finnhub.io/api/v1/news",
                params={"category": category, "token": FINNHUB_KEY, "minId": min_id},
            )
            resp.raise_for_status()
            items = resp.json()

        results = []
        for item in items[:50]:
            results.append({
                "headline":     item.get("headline", ""),
                "source":       item.get("source", "finnhub"),
                "url":          item.get("url", ""),
                "published_at": datetime.fromtimestamp(item.get("datetime", 0), tz=timezone.utc),
                "content":      item.get("summary", ""),
            })
        logger.info("Finnhub: fetched %d news items", len(results))
        return results

    async def fetch_finnhub_company_news(self, symbol: str, days_back: int = 7) -> list[dict]:
        if not FINNHUB_KEY:
            return []
        from_dt = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%d")
        to_dt   = datetime.utcnow().strftime("%Y-%m-%d")
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://finnhub.io/api/v1/company-news",
                params={"symbol": symbol, "from": from_dt, "to": to_dt, "token": FINNHUB_KEY},
            )
            resp.raise_for_status()
            items = resp.json()
        return [
            {
                "headline":     item.get("headline", ""),
                "source":       item.get("source", "finnhub"),
                "url":          item.get("url", ""),
                "published_at": datetime.fromtimestamp(item.get("datetime", 0), tz=timezone.utc),
                "content":      item.get("summary", ""),
                "symbol":       symbol,
            }
            for item in items[:20]
        ]

    # ─────────────────────────────────────────────────────────────
    # MarketAux — 250 req/day
    # ─────────────────────────────────────────────────────────────

    async def fetch_marketaux_news(
        self,
        symbols:  Optional[str] = None,
        limit:    int = 10,
        language: str = "en",
        sentiment: Optional[str] = None,
    ) -> list[dict]:
        if not MARKETAUX_KEY:
            return []
        params: dict = {"api_token": MARKETAUX_KEY, "language": language, "limit": min(limit, 50)}
        if symbols:
            params["symbols"] = symbols
        if sentiment:
            params["sentiment_gte"] = 0.3 if sentiment == "bullish" else -1.0
            params["sentiment_lte"] = 1.0 if sentiment == "bullish" else -0.3

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get("https://api.marketaux.com/v1/news/all", params=params)
            resp.raise_for_status()
            data = resp.json()

        results = []
        for item in data.get("data", []):
            entities = item.get("entities", [])
            syms     = [e["symbol"] for e in entities if e.get("symbol")]
            sent_score = 0.0
            for e in entities:
                if "sentiment_score" in e:
                    sent_score = e["sentiment_score"]
                    break
            results.append({
                "headline":         item.get("title", ""),
                "source":           item.get("source", "marketaux"),
                "url":              item.get("url", ""),
                "published_at":     datetime.fromisoformat(item.get("published_at", "").replace("Z", "+00:00")),
                "content":          item.get("description", ""),
                "affected_symbols": syms,
                "sentiment_score":  round(sent_score, 4),
            })
        logger.info("MarketAux: fetched %d news items", len(results))
        return results

    # ─────────────────────────────────────────────────────────────
    # FRED — unlimited macro indicators
    # ─────────────────────────────────────────────────────────────

    FRED_SERIES = {
        "DFF":      "Fed Funds Rate",
        "T10Y2Y":   "10Y-2Y Spread",
        "VIXCLS":   "VIX Close",
        "UNRATE":   "Unemployment Rate",
        "CPIAUCSL": "CPI (All Items)",
        "DTWEXBGS": "USD Trade Weighted",
    }

    async def fetch_fred_indicator(self, series_id: str, limit: int = 30) -> list[dict]:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://api.stlouisfed.org/fred/series/observations",
                params={
                    "series_id":          series_id,
                    "api_key":            FRED_API_KEY or "demo",
                    "file_type":          "json",
                    "sort_order":         "desc",
                    "limit":              limit,
                    "observation_start":  (datetime.utcnow() - timedelta(days=90)).strftime("%Y-%m-%d"),
                },
            )
            resp.raise_for_status()
            data = resp.json()
        return [
            {"series_id": series_id, "name": self.FRED_SERIES.get(series_id, series_id),
             "date": obs["date"], "value": float(obs["value"])}
            for obs in data.get("observations", [])
            if obs["value"] not in (".", "")
        ]

    # ─────────────────────────────────────────────────────────────
    # Economic Calendar — Finnhub
    # ─────────────────────────────────────────────────────────────

    async def fetch_economic_calendar(self, days_ahead: int = 7) -> list[dict]:
        if not FINNHUB_KEY:
            return []
        from_dt = datetime.utcnow().strftime("%Y-%m-%d")
        to_dt   = (datetime.utcnow() + timedelta(days=days_ahead)).strftime("%Y-%m-%d")
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    "https://finnhub.io/api/v1/calendar/economic",
                    params={"from": from_dt, "to": to_dt, "token": FINNHUB_KEY},
                )
                resp.raise_for_status()
                data = resp.json()
            events = []
            for ev in data.get("economicCalendar", []):
                time_str = ev.get("time", from_dt)
                try:
                    event_dt = datetime.strptime(time_str, "%Y-%m-%d %H:%M:%S") if " " in time_str \
                               else datetime.strptime(time_str, "%Y-%m-%d")
                except ValueError:
                    event_dt = datetime.utcnow()
                events.append({
                    "event_date": event_dt,
                    "country":    ev.get("country", ""),
                    "event_name": ev.get("event", ""),
                    "impact":     ev.get("impact", "low").lower(),
                    "forecast":   str(ev.get("estimate", "")),
                    "previous":   str(ev.get("prev", "")),
                    "actual":     str(ev.get("actual", "")),
                    "source":     "finnhub",
                })
            return events
        except Exception as e:
            logger.warning("Economic calendar fetch failed: %s", e)
            return []

    # ─────────────────────────────────────────────────────────────
    # Alpha Vantage — 25 calls/day (supplemental)
    # ─────────────────────────────────────────────────────────────

    async def fetch_alpha_vantage_quote(self, symbol: str) -> Optional[dict]:
        if not ALPHA_VANTAGE_KEY:
            return None
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://www.alphavantage.co/query",
                params={"function": "GLOBAL_QUOTE", "symbol": symbol, "apikey": ALPHA_VANTAGE_KEY},
            )
            resp.raise_for_status()
            data = resp.json().get("Global Quote", {})
        if not data:
            return None
        return {
            "symbol":     data.get("01. symbol"),
            "price":      float(data.get("05. price", 0)),
            "change":     float(data.get("09. change", 0)),
            "change_pct": float(data.get("10. change percent", "0%").replace("%", "")),
            "volume":     int(data.get("06. volume", 0)),
            "ts":         datetime.now(timezone.utc),
        }

    # ─────────────────────────────────────────────────────────────
    # Market regime detection (rule-based)
    # ─────────────────────────────────────────────────────────────

    def detect_risk_regime(self, quotes: list[dict]) -> str:
        by_sym = {q["symbol"]: q for q in quotes}

        vix_chg   = by_sym.get("^VIX",    {}).get("change_pct", 0) or 0
        vix_price = by_sym.get("^VIX",    {}).get("price", 20) or 20
        spx_chg   = by_sym.get("^GSPC",   {}).get("change_pct", 0) or 0
        gold_chg  = by_sym.get("GC=F",    {}).get("change_pct", 0) or 0
        usd_chg   = by_sym.get("DX-Y.NYB",{}).get("change_pct", 0) or 0

        risk_off_signals = sum([
            vix_price > 25,
            vix_chg > 10,
            gold_chg > 1.0,
            spx_chg < -1.5,
        ])
        risk_on_signals = sum([
            vix_price < 16,
            spx_chg > 0.5,
            gold_chg < -0.5,
        ])

        if risk_off_signals >= 3:   return "risk-off"
        if risk_on_signals  >= 2:   return "risk-on"
        if risk_off_signals >= 2:   return "transition"
        return "neutral"
