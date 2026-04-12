"""
Pydantic schemas for request/response validation.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────────────
# Market Data
# ─────────────────────────────────────────────────────────────────

class PriceTick(BaseModel):
    symbol:    str
    ts:        datetime
    open:      Optional[float] = None
    high:      Optional[float] = None
    low:       Optional[float] = None
    close:     float
    volume:    Optional[int]   = None
    adj_close: Optional[float] = None


class IndexInfo(BaseModel):
    symbol:      str
    name:        str
    region:      str
    country:     Optional[str] = None
    currency:    str = "USD"
    asset_class: str = "equity"
    timezone:    str = "America/New_York"


class MarketQuote(BaseModel):
    symbol:       str
    name:         str
    region:       str
    currency:     str
    asset_class:  str
    price:        Optional[float]
    change:       Optional[float]   # absolute change
    change_pct:   Optional[float]   # percentage change
    volume:       Optional[int]
    ts:           Optional[datetime]


class MarketSnapshot(BaseModel):
    americas:   list[MarketQuote] = []
    emea:       list[MarketQuote] = []
    asia:       list[MarketQuote] = []
    safe_havens: list[MarketQuote] = []
    india:       list[MarketQuote] = []
    risk_regime: str = "neutral"   # risk-on | risk-off | transition | neutral
    updated_at:  datetime


# ─────────────────────────────────────────────────────────────────
# News
# ─────────────────────────────────────────────────────────────────

class NewsItem(BaseModel):
    id:               int
    headline:         str
    source:           Optional[str]
    url:              Optional[str]
    published_at:     datetime
    sentiment:        Optional[str]
    sentiment_score:  Optional[float]
    impact_score:     Optional[int]
    affected_symbols: list[str] = []
    summary:          Optional[str]


class NewsCreate(BaseModel):
    headline:     str
    source:       Optional[str]
    url:          Optional[str]
    published_at: datetime
    content:      Optional[str]


class NewsSearchRequest(BaseModel):
    query:  str
    limit:  int = Field(default=10, ge=1, le=50)


# ─────────────────────────────────────────────────────────────────
# Momentum
# ─────────────────────────────────────────────────────────────────

class MomentumScore(BaseModel):
    symbol:             str
    name:               Optional[str]
    region:             Optional[str]
    asset_class:        Optional[str]
    calculated_at:      datetime
    price_momentum_1d:  Optional[float]
    price_momentum_1w:  Optional[float]
    price_momentum_1m:  Optional[float]
    price_momentum_3m:  Optional[float]
    volume_momentum:    Optional[float]
    relative_strength:  Optional[float]
    composite_score:    Optional[float]
    percentile_rank:    Optional[float]
    regime:             Optional[str]
    ai_commentary:      Optional[str]


class MomentumScanResult(BaseModel):
    leaders:  list[MomentumScore]
    laggards: list[MomentumScore]
    updated_at: datetime


# ─────────────────────────────────────────────────────────────────
# Chat / RAG
# ─────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role:    str  # user | assistant | system
    content: str


class ChatRequest(BaseModel):
    message:    str
    history:    list[ChatMessage] = []
    use_rag:    bool = True


class ChatResponse(BaseModel):
    answer:      str
    provider:    str
    sources:     list[dict[str, Any]] = []
    latency_ms:  int


# ─────────────────────────────────────────────────────────────────
# Journal
# ─────────────────────────────────────────────────────────────────

class JournalCreate(BaseModel):
    trade_date:  date
    symbol:      str
    action:      str
    quantity:    Optional[float]
    price:       Optional[float]
    strategy_tag: Optional[str]
    rationale:   Optional[str]
    emotion:     Optional[str]


class JournalUpdate(BaseModel):
    exit_price:      Optional[float]
    exit_date:       Optional[date]
    lessons_learned: Optional[str]
    ai_review:       Optional[str]


class JournalEntry(BaseModel):
    id:              int
    trade_date:      date
    symbol:          str
    action:          str
    quantity:        Optional[float]
    price:           Optional[float]
    total_value:     Optional[float]
    strategy_tag:    Optional[str]
    rationale:       Optional[str]
    emotion:         Optional[str]
    exit_price:      Optional[float]
    exit_date:       Optional[date]
    pnl:             Optional[float]
    pnl_percent:     Optional[float]
    ai_review:       Optional[str]
    lessons_learned: Optional[str]
    created_at:      datetime


# ─────────────────────────────────────────────────────────────────
# Morning Briefing
# ─────────────────────────────────────────────────────────────────

class BriefingResponse(BaseModel):
    id:              int
    briefing_date:   date
    content:         str
    provider:        str
    key_themes:      list[str] = []
    risk_regime:     Optional[str]
    created_at:      datetime


# ─────────────────────────────────────────────────────────────────
# Alerts
# ─────────────────────────────────────────────────────────────────

class AlertCreate(BaseModel):
    symbol:     Optional[str]
    alert_type: str
    threshold:  Optional[float]
    condition:  dict[str, Any] = {}


class AlertResponse(BaseModel):
    id:          int
    symbol:      Optional[str]
    alert_type:  str
    threshold:   Optional[float]
    is_active:   bool
    triggered_at: Optional[datetime]
    message:     Optional[str]
    created_at:  datetime


# ─────────────────────────────────────────────────────────────────
# Health Check
# ─────────────────────────────────────────────────────────────────

class ServiceHealth(BaseModel):
    status:   str   # ok | degraded | down
    message:  Optional[str]   = None
    latency:  Optional[float] = None


class HealthResponse(BaseModel):
    status:   str
    version:  str
    services: dict[str, ServiceHealth]
    uptime_s: float
