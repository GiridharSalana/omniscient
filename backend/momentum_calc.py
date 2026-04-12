"""
Momentum Calculation Engine
Multi-factor momentum scanner for 50,000+ securities.

Factors:
  1. Price ROC (1d, 3d, 1w, 1m, 3m)
  2. Volume momentum (current vs 20-day average)
  3. Relative strength vs region/sector average
  4. Composite weighted score
  5. Percentile rank within universe
  6. Regime classification
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from statistics import mean, stdev
from typing import Optional

logger = logging.getLogger(__name__)

# Composite score weights (sum to 1.0)
WEIGHTS = {
    "roc_1d":   0.25,
    "roc_1w":   0.25,
    "roc_1m":   0.25,
    "roc_3m":   0.15,
    "volume":   0.10,
}

# Regime classification thresholds (percentile rank)
REGIME_THRESHOLDS = {
    "surging":  80,
    "strong":   60,
    "neutral":  40,
    "weak":     20,
    # below 20 → crashing
}


class MomentumCalculator:
    """Stateless calculator — pass price series, get momentum scores."""

    def calculate(
        self,
        symbol:         str,
        closes:         list[float],   # chronological, oldest first
        volumes:        list[int],
        region_closes:  Optional[list[float]] = None,  # regional index closes
    ) -> Optional[dict]:
        """
        Calculate full momentum score for a symbol.
        Requires at least 66 bars for 3-month momentum.
        Returns None if insufficient data.
        """
        if len(closes) < 22:
            logger.debug("Insufficient data for %s: %d bars", symbol, len(closes))
            return None

        try:
            roc_1d = self._roc(closes, 1)
            roc_3d = self._roc(closes, 3)  if len(closes) > 3  else None
            roc_1w = self._roc(closes, 5)  if len(closes) > 5  else None
            roc_1m = self._roc(closes, 21) if len(closes) > 21 else None
            roc_3m = self._roc(closes, 63) if len(closes) > 63 else None

            vol_momentum  = self._volume_momentum(volumes)
            rel_strength  = self._relative_strength(closes, region_closes) if region_closes else 0.0
            composite     = self._composite_score(roc_1d, roc_1w, roc_1m, roc_3m, vol_momentum)

            return {
                "symbol":             symbol,
                "calculated_at":      datetime.now(timezone.utc),
                "price_momentum_1d":  round(roc_1d,  4) if roc_1d  is not None else None,
                "price_momentum_3d":  round(roc_3d,  4) if roc_3d  is not None else None,
                "price_momentum_1w":  round(roc_1w,  4) if roc_1w  is not None else None,
                "price_momentum_1m":  round(roc_1m,  4) if roc_1m  is not None else None,
                "price_momentum_3m":  round(roc_3m,  4) if roc_3m  is not None else None,
                "volume_momentum":    round(vol_momentum, 4),
                "relative_strength":  round(rel_strength, 4),
                "composite_score":    round(composite, 4),
                "percentile_rank":    None,  # calculated after full universe scan
                "regime":             None,  # set after percentile ranking
                "data": {
                    "closes_30d":     closes[-30:] if len(closes) >= 30 else closes,
                    "volumes_20d":    volumes[-20:] if len(volumes) >= 20 else volumes,
                },
            }
        except Exception as e:
            logger.error("Momentum calc error for %s: %s", symbol, e)
            return None

    # ── Factor calculations ────────────────────────────────────────

    def _roc(self, closes: list[float], period: int) -> float:
        """Rate of change over N periods (percentage)."""
        if len(closes) <= period or closes[-period-1] == 0:
            return 0.0
        return (closes[-1] / closes[-1 - period] - 1) * 100

    def _volume_momentum(self, volumes: list[int]) -> float:
        """
        Volume ratio: current volume vs 20-day average.
        > 1.5 = high conviction; < 0.5 = low conviction.
        """
        if not volumes or len(volumes) < 2:
            return 1.0
        lookback = min(20, len(volumes) - 1)
        avg_20d  = mean(volumes[-lookback-1:-1]) if lookback > 0 else volumes[-1]
        if avg_20d == 0:
            return 1.0
        return volumes[-1] / avg_20d

    def _relative_strength(
        self,
        closes:        list[float],
        region_closes: list[float],
        period:        int = 21,
    ) -> float:
        """
        Symbol's 1-month ROC minus regional benchmark ROC.
        Positive = outperforming region.
        """
        sym_roc    = self._roc(closes,        period)
        region_roc = self._roc(region_closes, period)
        return sym_roc - region_roc

    def _composite_score(
        self,
        roc_1d:       Optional[float],
        roc_1w:       Optional[float],
        roc_1m:       Optional[float],
        roc_3m:       Optional[float],
        vol_momentum: float,
    ) -> float:
        """Weighted composite score with volume confirmation."""
        score = 0.0
        score += (roc_1d or 0) * WEIGHTS["roc_1d"]
        score += (roc_1w or 0) * WEIGHTS["roc_1w"]
        score += (roc_1m or 0) * WEIGHTS["roc_1m"]
        score += (roc_3m or 0) * WEIGHTS["roc_3m"]
        # Volume momentum: convert ratio to % contribution
        # ratio 2.0 → +5% bonus; ratio 0.5 → -2.5% penalty
        vol_contribution = (vol_momentum - 1) * 5
        score += vol_contribution * WEIGHTS["volume"]
        return score

    # ── Universe-level ranking ────────────────────────────────────

    def rank_universe(self, scores: list[dict]) -> list[dict]:
        """
        Assign percentile rank and regime to all scores in the universe.
        Call this after calculating all individual scores.
        """
        if not scores:
            return scores

        composites = [s["composite_score"] for s in scores if s.get("composite_score") is not None]
        if not composites:
            return scores

        composites_sorted = sorted(composites)
        n = len(composites_sorted)

        for score in scores:
            cs = score.get("composite_score")
            if cs is None:
                score["percentile_rank"] = 50.0
                score["regime"]          = "neutral"
                continue

            # Percentile rank: fraction of universe below this score
            rank = sum(1 for c in composites_sorted if c < cs) / n * 100
            score["percentile_rank"] = round(rank, 2)

            if rank >= REGIME_THRESHOLDS["surging"]:
                score["regime"] = "surging"
            elif rank >= REGIME_THRESHOLDS["strong"]:
                score["regime"] = "strong"
            elif rank >= REGIME_THRESHOLDS["neutral"]:
                score["regime"] = "neutral"
            elif rank >= REGIME_THRESHOLDS["weak"]:
                score["regime"] = "weak"
            else:
                score["regime"] = "crashing"

        return scores

    def get_leaders_laggards(
        self,
        scores: list[dict],
        top_n:  int = 10,
    ) -> tuple[list[dict], list[dict]]:
        """
        Return top N leaders and bottom N laggards — non-overlapping sets.
        When universe is small, leaders = positive composite, laggards = negative/lowest.
        """
        valid  = [s for s in scores if s.get("composite_score") is not None]
        ranked = sorted(valid, key=lambda s: s["composite_score"], reverse=True)

        n = len(ranked)
        if n == 0:
            return [], []

        # Split universe cleanly — top half = leaders, bottom half = laggards
        # Ensure no symbol appears in both lists
        split = max(1, n // 2)
        leaders  = ranked[:split][:top_n]
        laggards = ranked[split:][::-1][:top_n]  # worst first

        return leaders, laggards

    # ── RSI (bonus indicator) ─────────────────────────────────────

    def rsi(self, closes: list[float], period: int = 14) -> Optional[float]:
        """Relative Strength Index (Wilder's method)."""
        if len(closes) < period + 1:
            return None

        gains  = []
        losses = []
        for i in range(1, len(closes)):
            diff = closes[i] - closes[i-1]
            gains.append(max(diff, 0))
            losses.append(max(-diff, 0))

        avg_gain = mean(gains[-period:])
        avg_loss = mean(losses[-period:])

        if avg_loss == 0:
            return 100.0
        rs  = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        return round(rsi, 2)

    # ── MACD ──────────────────────────────────────────────────────

    def macd(
        self,
        closes:  list[float],
        fast:    int = 12,
        slow:    int = 26,
        signal:  int = 9,
    ) -> Optional[dict]:
        """MACD, signal line, and histogram."""
        if len(closes) < slow + signal:
            return None

        ema_fast   = self._ema(closes, fast)
        ema_slow   = self._ema(closes, slow)
        macd_line  = [f - s for f, s in zip(ema_fast[slow-fast:], ema_slow)]
        signal_line = self._ema(macd_line, signal)
        histogram  = [m - s for m, s in zip(macd_line[signal-1:], signal_line)]

        return {
            "macd":      round(macd_line[-1],   4),
            "signal":    round(signal_line[-1], 4),
            "histogram": round(histogram[-1],   4),
            "bullish":   histogram[-1] > 0 and histogram[-1] > histogram[-2],
        }

    def _ema(self, data: list[float], period: int) -> list[float]:
        """Exponential moving average."""
        if len(data) < period:
            return []
        k    = 2 / (period + 1)
        ema  = [mean(data[:period])]
        for val in data[period:]:
            ema.append(val * k + ema[-1] * (1 - k))
        return ema
