// ─────────────────────────────────────────────────────────────────
// Omniscient TypeScript types — mirrors backend Pydantic schemas
// ─────────────────────────────────────────────────────────────────

export interface MarketQuote {
  symbol:      string
  name:        string
  region:      string
  currency:    string
  asset_class: string
  price:       number | null
  change:      number | null
  change_pct:  number | null
  volume:      number | null
  ts:          string | null
}

export interface MarketSnapshot {
  americas:    MarketQuote[]
  emea:        MarketQuote[]
  asia:        MarketQuote[]
  safe_havens: MarketQuote[]
  india:       MarketQuote[]
  risk_regime: 'risk-on' | 'risk-off' | 'transition' | 'neutral'
  updated_at:  string
}

export interface NewsItem {
  id:               number
  headline:         string
  source:           string | null
  url:              string | null
  published_at:     string
  sentiment:        'bullish' | 'bearish' | 'neutral' | null
  sentiment_score:  number | null
  impact_score:     number | null
  affected_symbols: string[]
  summary:          string | null
}

export interface NewsDistribution {
  bullish:  { count: number; avg_impact: number; items: NewsItem[] }
  bearish:  { count: number; avg_impact: number; items: NewsItem[] }
  neutral:  { count: number; avg_impact: number; items: NewsItem[] }
}

export interface MomentumScore {
  symbol:             string
  name:               string | null
  region:             string | null
  asset_class:        string | null
  calculated_at:      string
  price_momentum_1d:  number | null
  price_momentum_1w:  number | null
  price_momentum_1m:  number | null
  price_momentum_3m:  number | null
  volume_momentum:    number | null
  relative_strength:  number | null
  composite_score:    number | null
  percentile_rank:    number | null
  regime:             'surging' | 'strong' | 'neutral' | 'weak' | 'crashing' | null
  ai_commentary:      string | null
}

export interface MomentumScanResult {
  leaders:    MomentumScore[]
  laggards:   MomentumScore[]
  updated_at: string
}

export interface ChatMessage {
  role:    'user' | 'assistant' | 'system'
  content: string
}

export interface ChatResponse {
  answer:     string
  provider:   string
  sources:    Array<{
    headline:    string
    source:      string
    published_at: string
    sentiment:   string | null
    similarity:  number
  }>
  latency_ms: number
}

export interface BriefingResponse {
  id:            number
  briefing_date: string
  content:       string
  provider:      string
  key_themes:    string[]
  risk_regime:   string | null
  created_at:    string
}

export interface JournalEntry {
  id:              number
  trade_date:      string
  symbol:          string
  action:          string
  quantity:        number | null
  price:           number | null
  total_value:     number | null
  strategy_tag:    string | null
  rationale:       string | null
  emotion:         string | null
  exit_price:      number | null
  exit_date:       string | null
  pnl:             number | null
  pnl_percent:     number | null
  ai_review:       string | null
  lessons_learned: string | null
  created_at:      string
}

export interface AlertResponse {
  id:           number
  symbol:       string | null
  alert_type:   string
  threshold:    number | null
  is_active:    boolean
  triggered_at: string | null
  message:      string | null
  created_at:   string
}

export interface WatchlistItem {
  symbol:       string
  name:         string | null
  target_price: number | null
  stop_loss:    number | null
  price:        number | null
  change:       number | null
  change_pct:   number | null
  volume:       number | null
}

export interface EconomicEvent {
  event_date:  string
  country:     string
  event_name:  string
  impact:      'low' | 'medium' | 'high'
  forecast:    string | null
  previous:    string | null
  actual:      string | null
}

export type RiskRegime = 'risk-on' | 'risk-off' | 'transition' | 'neutral'
export type Sentiment  = 'bullish' | 'bearish' | 'neutral'
export type MomentumRegime = 'surging' | 'strong' | 'neutral' | 'weak' | 'crashing'

// ── Macro Intelligence ────────────────────────────────────────────
export interface MacroIndicator {
  key:        string
  label:      string
  value:      number | null
  prev_value: number | null
  change:     number | null
  unit:       string
  date:       string | null
  trend:      'up' | 'down' | 'flat'
  signal:     'bullish' | 'bearish' | 'neutral'
}

export interface YieldCurvePoint {
  label:  string
  yield_: number
  series: string
}

export interface MacroSnapshot {
  indicators:    MacroIndicator[]
  yield_curve:   YieldCurvePoint[]
  regime_signal: 'risk-on' | 'risk-off' | 'caution'
  regime_reason: string
  as_of:         string
}

export interface SectorPerf {
  sector: string
  rank:   number
  d1:     number | null
  d5:     number | null
  d30:    number | null
  ytd:    number | null
}

export interface EarningsEvent {
  symbol:       string
  company:      string
  report_date:  string
  eps_estimate: number | null
  eps_actual:   number | null
  revenue_est:  number | null
  surprise_pct: number | null
  time_of_day:  string
}

// ── Technical Analysis ────────────────────────────────────────────
export interface TechSignal {
  symbol:         string
  name:           string | null
  price:          number | null
  sma_20:         number | null
  sma_50:         number | null
  sma_200:        number | null
  rsi_14:         number | null
  macd:           number | null
  macd_signal:    number | null
  macd_hist:      number | null
  bb_upper:       number | null
  bb_lower:       number | null
  bb_pct:         number | null
  week_52_high:   number | null
  week_52_low:    number | null
  pct_from_high:  number | null
  pct_from_low:   number | null
  avg_volume_20:  number | null
  last_volume:    number | null
  volume_ratio:   number | null
  rsi_signal:     'oversold' | 'neutral' | 'overbought'
  trend_signal:   'bullish' | 'bearish' | 'neutral'
  ma_cross:       'golden_cross' | 'death_cross' | 'none'
  volume_signal:  'high' | 'normal' | 'low'
  overall:        'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell'
  data_points:    number
}

export interface VolumeAnomaly {
  symbol:       string
  name:         string | null
  price:        number | null
  change_pct:   number | null
  volume:       number
  avg_volume:   number
  volume_ratio: number
  direction:    'up' | 'down' | 'flat'
}

// ── Screener ─────────────────────────────────────────────────────
export interface ScreenerResult {
  symbol:            string
  name:              string | null
  price:             number | null
  change_pct:        number | null
  volume:            number | null
  volume_ratio:      number | null
  rsi_14:            number | null
  sma_20:            number | null
  sma_50:            number | null
  sma_200:           number | null
  trend_signal:      string
  rsi_signal:        string
  ma_cross:          string
  overall:           string
  pct_from_52w_high: number | null
  match_reason:      string
  data_source:       string
}

export interface ScreenerResponse {
  preset:   string
  label:    string
  desc:     string
  icon:     string
  color:    string
  results:  ScreenerResult[]
  universe: number
  matched:  number
}
