"""
Macro Intelligence Router — FRED economic data, yield curve, sector performance.
Provides the macro context every trader needs for regime awareness.
"""
from __future__ import annotations

import logging
import os
from datetime import date, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

FRED_KEY = os.getenv("FRED_API_KEY", "")
ALPHA_KEY = os.getenv("ALPHA_VANTAGE_KEY", "")
FINNHUB_KEY = os.getenv("FINNHUB_KEY", "")

# ── FRED series IDs ────────────────────────────────────────────────
FRED_SERIES = {
    "fed_funds":   ("FEDFUNDS",         "Fed Funds Rate",        "%"),
    "cpi_yoy":     ("CPIAUCSL",         "CPI Inflation",         "%"),
    "unemployment":("UNRATE",           "Unemployment Rate",     "%"),
    "gdp_growth":  ("A191RL1Q225SBEA",  "Real GDP Growth",       "%"),
    "t10y2y":      ("T10Y2Y",           "10Y-2Y Spread",         "bps"),
    "t10y3m":      ("T10Y3M",           "10Y-3M Spread",         "bps"),
    "dgs2":        ("DGS2",             "2Y Treasury",           "%"),
    "dgs10":       ("DGS10",            "10Y Treasury",          "%"),
    "dgs30":       ("DGS30",            "30Y Treasury",          "%"),
    "baa10y":      ("BAA10Y",           "Corp Credit Spread",    "bps"),
    "vix":         ("VIXCLS",           "VIX",                   ""),
    "oil":         ("DCOILWTICO",       "WTI Crude Oil",         "$/bbl"),
    "m2":          ("M2SL",             "M2 Money Supply",       "$B"),
}

# ── Models ──────────────────────────────────────────────────────────
class MacroIndicator(BaseModel):
    key:        str
    label:      str
    value:      Optional[float]
    prev_value: Optional[float]
    change:     Optional[float]
    unit:       str
    date:       Optional[str]
    trend:      str   # up / down / flat
    signal:     str   # bullish / bearish / neutral for risk-on/off

class YieldCurvePoint(BaseModel):
    label: str
    yield_: float
    series: str

class MacroSnapshot(BaseModel):
    indicators: list[MacroIndicator]
    yield_curve: list[YieldCurvePoint]
    regime_signal: str   # risk-on / risk-off / caution
    regime_reason: str
    as_of: str

class SectorPerf(BaseModel):
    sector: str
    rank:   int
    d1:     Optional[float]
    d5:     Optional[float]
    d30:    Optional[float]
    ytd:    Optional[float]

class EarningsEvent(BaseModel):
    symbol:         str
    company:        str
    report_date:    str
    eps_estimate:   Optional[float]
    eps_actual:     Optional[float]
    revenue_est:    Optional[float]
    surprise_pct:   Optional[float]
    time_of_day:    str   # BMO / AMC / TNS


# ── FRED helpers ────────────────────────────────────────────────────
async def _fred(series_id: str, limit: int = 5) -> list[dict]:
    """Fetch latest N observations from FRED."""
    if not FRED_KEY:
        return []
    url = "https://api.stlouisfed.org/fred/series/observations"
    params = {
        "series_id":  series_id,
        "api_key":    FRED_KEY,
        "file_type":  "json",
        "sort_order": "desc",
        "limit":      limit,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
            obs = r.json().get("observations", [])
            # Filter out "." (missing) values
            return [o for o in obs if o.get("value") not in (".", "", None)]
    except Exception as e:
        logger.warning("FRED %s error: %s", series_id, e)
        return []


def _parse_fred_val(obs: list[dict], idx: int = 0) -> Optional[float]:
    if idx < len(obs):
        try:
            return float(obs[idx]["value"])
        except (ValueError, KeyError):
            return None
    return None


def _trend(current: Optional[float], prev: Optional[float]) -> str:
    if current is None or prev is None:
        return "flat"
    if current > prev + 0.01:
        return "up"
    if current < prev - 0.01:
        return "down"
    return "flat"


def _macro_signal(key: str, value: Optional[float], change: Optional[float]) -> str:
    """Interpret macro indicator as bullish/bearish/neutral for equities."""
    if value is None:
        return "neutral"
    if key == "fed_funds":
        return "bearish" if value > 4.5 else ("neutral" if value > 2.5 else "bullish")
    if key == "cpi_yoy":
        return "bearish" if value > 4.0 else ("neutral" if value > 2.5 else "bullish")
    if key == "unemployment":
        return "bearish" if value > 5.5 else ("neutral" if value > 4.0 else "bullish")
    if key == "t10y2y":
        return "bearish" if value < -0.5 else ("neutral" if value < 0.5 else "bullish")
    if key == "baa10y":
        return "bearish" if value > 3.0 else ("neutral" if value > 2.0 else "bullish")
    if key == "vix":
        return "bearish" if value > 25 else ("neutral" if value > 18 else "bullish")
    if key == "gdp_growth":
        return "bullish" if value > 2.5 else ("neutral" if value > 0 else "bearish")
    return "neutral"


# ── Endpoints ────────────────────────────────────────────────────────
@router.get("/snapshot", response_model=MacroSnapshot)
async def macro_snapshot():
    """
    Full macro intelligence snapshot:
    - Key FRED indicators with trend + equity signal
    - Yield curve (2Y/5Y/10Y/30Y)
    - Composite regime signal (risk-on / risk-off / caution)
    """
    # Fetch all series in parallel
    import asyncio
    tasks = {key: _fred(ids[0], 3) for key, ids in FRED_SERIES.items()}
    results = {}
    coros = list(tasks.items())
    fetched = await asyncio.gather(*[v for _, v in coros], return_exceptions=True)
    for (key, _), data in zip(coros, fetched):
        results[key] = data if isinstance(data, list) else []

    # For CPI, fetch 13 months to compute YoY rate
    cpi_obs = await _fred("CPIAUCSL", 14)
    cpi_curr = _parse_fred_val(cpi_obs, 0)
    cpi_year_ago = _parse_fred_val(cpi_obs, 12)
    cpi_prev_month = _parse_fred_val(cpi_obs, 1)
    if cpi_curr and cpi_year_ago and cpi_year_ago > 0:
        cpi_yoy = round(((cpi_curr - cpi_year_ago) / cpi_year_ago) * 100, 2)
        cpi_prev_yoy = None
        if cpi_prev_month and cpi_year_ago:
            cpi_year_minus1 = _parse_fred_val(cpi_obs, 13)
            if cpi_year_minus1 and cpi_year_minus1 > 0:
                cpi_prev_yoy = round(((cpi_prev_month - cpi_year_minus1) / cpi_year_minus1) * 100, 2)
        results["cpi_yoy_value"] = (cpi_yoy, cpi_prev_yoy, cpi_obs[0].get("date") if cpi_obs else None)

    indicators = []
    for key, (series_id, label, unit) in FRED_SERIES.items():
        obs   = results.get(key, [])
        # CPI: use pre-computed YoY rate
        if key == "cpi_yoy" and "cpi_yoy_value" in results:
            curr, prev_v, dt = results["cpi_yoy_value"]
            change = round(curr - prev_v, 3) if curr and prev_v else None
            indicators.append(MacroIndicator(
                key=key, label=label, value=curr, prev_value=prev_v,
                change=change, unit=unit, date=dt,
                trend=_trend(curr, prev_v),
                signal=_macro_signal(key, curr, change),
            ))
            continue
        curr  = _parse_fred_val(obs, 0)
        prev  = _parse_fred_val(obs, 1)
        change = round(curr - prev, 4) if curr is not None and prev is not None else None
        dt     = obs[0].get("date") if obs else None
        indicators.append(MacroIndicator(
            key        = key,
            label      = label,
            value      = round(curr, 3) if curr is not None else None,
            prev_value = round(prev, 3) if prev is not None else None,
            change     = round(change, 3) if change is not None else None,
            unit       = unit,
            date       = dt,
            trend      = _trend(curr, prev),
            signal     = _macro_signal(key, curr, change),
        ))

    # ── Yield curve ─────────────────────────────────────────────────
    yield_curve = []
    for label, series_key, series_id in [
        ("2Y", "dgs2",  "DGS2"),
        ("5Y", "dgs5",  "DGS5"),
        ("10Y","dgs10", "DGS10"),
        ("30Y","dgs30", "DGS30"),
    ]:
        key_in_results = series_key if series_key in results else None
        if key_in_results:
            val = _parse_fred_val(results[key_in_results], 0)
        else:
            # 5Y is not in our FRED_SERIES, fetch it
            obs5 = await _fred("DGS5", 2)
            val = _parse_fred_val(obs5, 0)
        if val is not None:
            yield_curve.append(YieldCurvePoint(label=label, yield_=val, series=series_id))

    # ── Regime detection ─────────────────────────────────────────────
    bearish_count = sum(1 for i in indicators if i.signal == "bearish")
    bullish_count = sum(1 for i in indicators if i.signal == "bullish")

    # Weight key indicators more
    t10y2y_ind = next((i for i in indicators if i.key == "t10y2y"), None)
    vix_ind    = next((i for i in indicators if i.key == "vix"), None)
    baa_ind    = next((i for i in indicators if i.key == "baa10y"), None)

    if (t10y2y_ind and t10y2y_ind.value is not None and t10y2y_ind.value < -0.3) or \
       (vix_ind and vix_ind.value is not None and vix_ind.value > 30) or \
       (baa_ind and baa_ind.value is not None and baa_ind.value > 3.5):
        regime = "risk-off"
        reason = (
            "Inverted yield curve + elevated credit spreads signal recession risk. "
            "Favor defensives: gold, bonds, utilities."
        )
    elif bearish_count >= 4:
        regime = "caution"
        reason = (
            f"{bearish_count} macro indicators flashing bearish. "
            "Reduce position size, raise cash."
        )
    elif bullish_count >= 4:
        regime = "risk-on"
        reason = (
            "Macro backdrop supportive. Yield curve normal, "
            "inflation cooling, labor market healthy. Favor growth."
        )
    else:
        regime = "caution"
        reason = "Mixed macro signals. Stay selective, manage risk carefully."

    return MacroSnapshot(
        indicators    = indicators,
        yield_curve   = yield_curve,
        regime_signal = regime,
        regime_reason = reason,
        as_of         = str(date.today()),
    )


# Sector ETF map: short name → Yahoo Finance ticker
SECTOR_ETFS = {
    "Technology":       "XLK",
    "Financials":       "XLF",
    "Healthcare":       "XLV",
    "Energy":           "XLE",
    "Consumer Discret": "XLY",
    "Industrials":      "XLI",
    "Communication":    "XLC",
    "Materials":        "XLB",
    "Utilities":        "XLU",
    "Real Estate":      "XLRE",
    "Consumer Staples": "XLP",
}


async def _yahoo_quote(symbol: str, client: httpx.AsyncClient) -> Optional[dict]:
    """Fetch current + 5d + 30d change from Yahoo Finance v8 chart API."""
    try:
        r = await client.get(
            f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
            params={"range": "3mo", "interval": "1d"},
        )
        if r.status_code != 200:
            return None
        result = r.json().get("chart", {}).get("result", [])
        if not result:
            return None
        meta   = result[0].get("meta", {})
        closes = result[0].get("indicators", {}).get("quote", [{}])[0].get("close", [])
        closes = [c for c in closes if c is not None]
        if len(closes) < 2:
            return None

        curr = closes[-1]
        d1   = round(((curr / closes[-2]) - 1) * 100, 2) if len(closes) >= 2 else None
        d5   = round(((curr / closes[-6]) - 1) * 100, 2) if len(closes) >= 6 else None
        d30  = round(((curr / closes[-22]) - 1) * 100, 2) if len(closes) >= 22 else None
        # YTD: approximate using close from start of year (index 0 = ~90 days ago, so use start of available data)
        ytd  = round(((curr / closes[0]) - 1) * 100, 2) if len(closes) >= 60 else None
        return {"d1": d1, "d5": d5, "d30": d30, "ytd": ytd}
    except Exception:
        return None


@router.get("/sector-performance", response_model=list[SectorPerf])
async def sector_performance():
    """
    US sector ETF performance. Tries Alpha Vantage first; falls back to
    Yahoo Finance sector ETF quotes (free, reliable).
    """
    # Try Alpha Vantage first
    if ALPHA_KEY:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    "https://www.alphavantage.co/query",
                    params={"function": "SECTOR", "apikey": ALPHA_KEY},
                )
                r.raise_for_status()
                data = r.json()

            d1_data  = data.get("Rank A: Real-Time Performance", {})
            if d1_data and "Information" not in str(d1_data):  # quota check
                d5_data  = data.get("Rank B: 1 Day Performance", {})
                d30_data = data.get("Rank C: 5 Day Performance", {})
                ytd_data = data.get("Rank E: Year-to-Date (YTD) Performance", {})

                def parse_pct(s: str) -> Optional[float]:
                    try:
                        return float(s.strip("%"))
                    except Exception:
                        return None

                sectors = []
                for i, (sector, val) in enumerate(d1_data.items()):
                    if sector == "Meta Data":
                        continue
                    sectors.append(SectorPerf(
                        sector=sector, rank=i+1,
                        d1=parse_pct(val),
                        d5=parse_pct(d5_data.get(sector, "")),
                        d30=parse_pct(d30_data.get(sector, "")),
                        ytd=parse_pct(ytd_data.get(sector, "")),
                    ))
                if sectors:
                    return sorted(sectors, key=lambda s: s.d1 or 0, reverse=True)
        except Exception as e:
            logger.warning("Alpha Vantage sector error (will use fallback): %s", e)

    # Fallback: Yahoo Finance sector ETF quotes
    try:
        import asyncio
        headers = {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64)",
            "Accept": "application/json",
        }
        async with httpx.AsyncClient(timeout=15, headers=headers, follow_redirects=True) as client:
            tasks = {name: _yahoo_quote(ticker, client) for name, ticker in SECTOR_ETFS.items()}
            names = list(tasks.keys())
            results = await asyncio.gather(*tasks.values(), return_exceptions=True)

        sectors = []
        for i, (name, result) in enumerate(zip(names, results)):
            if isinstance(result, dict):
                sectors.append(SectorPerf(
                    sector=name, rank=i+1,
                    d1=result.get("d1"), d5=result.get("d5"),
                    d30=result.get("d30"), ytd=result.get("ytd"),
                ))

        return sorted(sectors, key=lambda s: s.d1 or 0, reverse=True)
    except Exception as e:
        logger.warning("Sector performance fallback error: %s", e)
        return []


@router.get("/earnings-calendar", response_model=list[EarningsEvent])
async def earnings_calendar(days_ahead: int = 14):
    """
    Earnings calendar for next N days via Finnhub.
    Includes EPS estimates, actuals, surprise %.
    """
    if not FINNHUB_KEY:
        return []
    from_date = date.today().isoformat()
    to_date   = (date.today() + timedelta(days=days_ahead)).isoformat()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://finnhub.io/api/v1/calendar/earnings",
                params={"from": from_date, "to": to_date, "token": FINNHUB_KEY},
            )
            r.raise_for_status()
            earnings = r.json().get("earningsCalendar", [])

        events = []
        for e in earnings[:50]:   # cap at 50 most relevant
            eps_est = e.get("epsEstimate")
            eps_act = e.get("epsActual")
            surprise = None
            if eps_est and eps_act and eps_est != 0:
                surprise = round(((eps_act - eps_est) / abs(eps_est)) * 100, 1)
            events.append(EarningsEvent(
                symbol       = e.get("symbol", ""),
                company      = e.get("name", e.get("symbol", "")),
                report_date  = e.get("date", ""),
                eps_estimate = eps_est,
                eps_actual   = eps_act,
                revenue_est  = e.get("revenueEstimate"),
                surprise_pct = surprise,
                time_of_day  = e.get("hour", "TNS"),  # BMO/AMC/TNS
            ))
        return events
    except Exception as e:
        logger.warning("Earnings calendar error: %s", e)
        return []
