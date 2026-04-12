"""
ML Price Prediction Router — Prophet time-series forecasting.
Provides 30-day price forecasts with confidence intervals.
"""
from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from typing import Optional

import httpx
import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from main import get_redis

YF_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}

logger = logging.getLogger(__name__)
router = APIRouter()

CACHE_TTL_PREDICT = 21600  # 6 hours


# ── Schemas ──────────────────────────────────────────────────────
class ForecastPoint(BaseModel):
    date:        str
    predicted:   float
    lower:       float
    upper:       float

class PredictionResult(BaseModel):
    symbol:       str
    current_price: float
    target_price:  float      # median 30-day prediction
    lower_bound:   float
    upper_bound:   float
    trend:         str        # up / down / sideways
    signal:        str        # buy / sell / hold
    confidence:    float      # 0-1
    forecast:      list[ForecastPoint]
    model:         str = "Prophet + RSI/MACD regressors"
    note:          str = "ML predictions are probabilistic — use as one input among many"


# ── Helpers ──────────────────────────────────────────────────────
def _calc_rsi(closes: list[float], period: int = 14) -> list[float]:
    """Return RSI series aligned with closes."""
    if len(closes) < period + 1:
        return [50.0] * len(closes)
    rsi = [50.0] * period
    gains = [max(closes[i] - closes[i-1], 0) for i in range(1, len(closes))]
    losses = [max(closes[i-1] - closes[i], 0) for i in range(1, len(closes))]
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        rs = avg_gain / (avg_loss + 1e-10)
        rsi.append(100 - 100 / (1 + rs))
    return rsi

def _calc_macd(closes: list[float]) -> list[float]:
    """Return MACD histogram series aligned with closes."""
    def ema(data, n):
        k = 2 / (n + 1)
        result = [data[0]]
        for v in data[1:]:
            result.append(v * k + result[-1] * (1 - k))
        return result

    if len(closes) < 26:
        return [0.0] * len(closes)
    ema12 = ema(closes, 12)
    ema26 = ema(closes, 26)
    macd_line = [e12 - e26 for e12, e26 in zip(ema12, ema26)]
    signal    = ema(macd_line, 9)
    return [m - s for m, s in zip(macd_line, signal)]

def _normalise(series: list[float]) -> list[float]:
    """Min-max normalise to [0, 1]."""
    mn, mx = min(series), max(series)
    rng = mx - mn or 1
    return [(v - mn) / rng for v in series]


# ── Main Prediction ──────────────────────────────────────────────
@router.get("/{symbol}/predict", response_model=PredictionResult)
async def predict_price(
    symbol:  str,
    days:    int = 30,
    redis = Depends(get_redis),
):
    """
    Prophet 30-day price forecast with RSI and MACD as additional regressors.
    Cached for 6 hours per symbol.
    """
    sym       = symbol.upper()
    cache_key = f"predict:{sym}:{days}"
    cached    = await redis.get(cache_key)
    if cached:
        return PredictionResult(**json.loads(cached))

    # ── Fetch 2 years of history via Yahoo Finance chart API ─────
    try:
        async with httpx.AsyncClient(timeout=15, headers=YF_HEADERS) as client:
            r = await client.get(
                f"https://query2.finance.yahoo.com/v8/finance/chart/{sym}",
                params={"interval": "1d", "range": "2y"},
            )
            r.raise_for_status()
            data   = r.json()
            result = (data.get("chart", {}).get("result") or [None])[0]
            if not result:
                raise HTTPException(422, f"No data found for {sym}")

        timestamps = result.get("timestamp", [])
        ohlcv      = result.get("indicators", {}).get("quote", [{}])[0]
        closes_raw = ohlcv.get("close") or []

        # Build clean dataframe
        records = [
            {"ds": pd.Timestamp.fromtimestamp(ts).normalize(), "y": float(c)}
            for ts, c in zip(timestamps, closes_raw)
            if c is not None
        ]
        df = pd.DataFrame(records).drop_duplicates("ds").sort_values("ds")
        if len(df) < 60:
            raise HTTPException(422, f"Not enough history to predict {sym} (got {len(df)} bars)")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Data fetch error: {e}")

    closes = df["y"].tolist()
    current_price = closes[-1]

    # ── Feature engineering ──────────────────────────────────────
    rsi_raw  = _calc_rsi(closes)
    macd_raw = _calc_macd(closes)
    df["rsi_norm"]  = _normalise(rsi_raw)
    df["macd_norm"] = _normalise(macd_raw)

    # 20-day rolling volatility as regressor
    df["volatility"] = df["y"].pct_change().rolling(20).std().fillna(0)
    df["vol_norm"]   = _normalise(df["volatility"].tolist())

    # ── Fit Prophet ──────────────────────────────────────────────
    try:
        from prophet import Prophet
        m = Prophet(
            daily_seasonality   = False,
            weekly_seasonality  = True,
            yearly_seasonality  = True,
            changepoint_prior_scale    = 0.1,
            seasonality_prior_scale    = 5.0,
            interval_width      = 0.80,
        )
        m.add_regressor("rsi_norm")
        m.add_regressor("macd_norm")
        m.add_regressor("vol_norm")

        train_df = df[["ds", "y", "rsi_norm", "macd_norm", "vol_norm"]].dropna()
        m.fit(train_df)

        # Future dataframe — forward fill regressors with last known value
        future = m.make_future_dataframe(periods=days)
        last_rsi  = df["rsi_norm"].iloc[-1]
        last_macd = df["macd_norm"].iloc[-1]
        last_vol  = df["vol_norm"].iloc[-1]
        future["rsi_norm"]  = last_rsi
        future["macd_norm"] = last_macd
        future["vol_norm"]  = last_vol
        # Use actual values for historical part
        for col in ["rsi_norm", "macd_norm", "vol_norm"]:
            future.loc[future["ds"].isin(train_df["ds"]), col] = train_df[col].values

        forecast = m.predict(future)
        fcast_future = forecast[forecast["ds"] > train_df["ds"].max()].head(days)

    except ImportError:
        # Prophet not installed — fallback: linear trend
        logger.warning("Prophet not available, using linear fallback for %s", sym)
        return _linear_fallback(sym, closes, current_price, days)
    except Exception as e:
        logger.error("Prophet error for %s: %s", sym, e)
        return _linear_fallback(sym, closes, current_price, days)

    # ── Build result ─────────────────────────────────────────────
    target = float(fcast_future["yhat"].iloc[-1]) if not fcast_future.empty else current_price
    lower  = float(fcast_future["yhat_lower"].min()) if not fcast_future.empty else current_price * 0.95
    upper  = float(fcast_future["yhat_upper"].max()) if not fcast_future.empty else current_price * 1.05

    pct_change = (target - current_price) / (current_price + 1e-10)
    trend  = "up" if pct_change > 0.02 else ("down" if pct_change < -0.02 else "sideways")
    signal = "buy" if pct_change > 0.03 else ("sell" if pct_change < -0.03 else "hold")

    # Confidence: narrower band = higher confidence
    band_width_pct = (upper - lower) / (current_price + 1e-10)
    confidence = max(0.3, min(0.95, 1.0 - band_width_pct * 2))

    points = [
        ForecastPoint(
            date=str(row["ds"].date()),
            predicted=round(float(row["yhat"]), 2),
            lower=round(float(row["yhat_lower"]), 2),
            upper=round(float(row["yhat_upper"]), 2),
        )
        for _, row in fcast_future.iterrows()
    ]

    result = PredictionResult(
        symbol=sym,
        current_price=round(current_price, 2),
        target_price=round(target, 2),
        lower_bound=round(lower, 2),
        upper_bound=round(upper, 2),
        trend=trend,
        signal=signal,
        confidence=round(confidence, 2),
        forecast=points,
    )
    await redis.setex(cache_key, CACHE_TTL_PREDICT, result.model_dump_json())
    return result


def _linear_fallback(sym: str, closes: list[float], current: float, days: int) -> PredictionResult:
    """Simple linear regression fallback when Prophet unavailable."""
    n = min(len(closes), 90)
    x = list(range(n))
    y = closes[-n:]
    x_mean = sum(x) / n
    y_mean = sum(y) / n
    slope = sum((xi - x_mean) * (yi - y_mean) for xi, yi in zip(x, y)) / (sum((xi - x_mean)**2 for xi in x) + 1e-10)

    target = current + slope * days
    std    = (sum((v - y_mean) ** 2 for v in y) / n) ** 0.5
    lower  = target - 1.5 * std
    upper  = target + 1.5 * std

    pct = (target - current) / (current + 1e-10)
    points = [
        ForecastPoint(
            date=str(date.today() + timedelta(days=i + 1)),
            predicted=round(current + slope * (i + 1), 2),
            lower=round(lower, 2),
            upper=round(upper, 2),
        )
        for i in range(days)
    ]
    return PredictionResult(
        symbol=sym,
        current_price=round(current, 2),
        target_price=round(target, 2),
        lower_bound=round(lower, 2),
        upper_bound=round(upper, 2),
        trend="up" if pct > 0.02 else ("down" if pct < -0.02 else "sideways"),
        signal="buy" if pct > 0.03 else ("sell" if pct < -0.03 else "hold"),
        confidence=0.45,
        forecast=points,
        model="Linear regression (fallback)",
    )
