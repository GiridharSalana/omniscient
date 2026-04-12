-- ─────────────────────────────────────────────────────────────────
-- Omniscient — PostgreSQL 15 Schema with pgvector
-- ─────────────────────────────────────────────────────────────────

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- ─────────────────────────────────────────────────────────────────
-- Market Indices Master List
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS indices (
    symbol          VARCHAR(20) PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    region          VARCHAR(50)  NOT NULL CHECK (region IN ('americas','emea','asia','global','crypto','commodity','fx','bond')),
    country         VARCHAR(100),
    currency        VARCHAR(10)  DEFAULT 'USD',
    timezone        VARCHAR(50)  DEFAULT 'Asia/Kolkata',
    market_open     TIME,
    market_close    TIME,
    asset_class     VARCHAR(50)  DEFAULT 'equity' CHECK (asset_class IN ('equity','commodity','fx','bond','crypto','volatility')),
    yahoo_symbol    VARCHAR(30),
    is_active       BOOLEAN      DEFAULT true,
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- Seed default indices
INSERT INTO indices (symbol, name, region, country, currency, timezone, asset_class, yahoo_symbol) VALUES
-- Americas
('^GSPC',  'S&P 500',          'americas', 'USA',        'USD', 'America/New_York',  'equity',    '^GSPC'),
('^IXIC',  'NASDAQ Composite', 'americas', 'USA',        'USD', 'America/New_York',  'equity',    '^IXIC'),
('^DJI',   'Dow Jones',        'americas', 'USA',        'USD', 'America/New_York',  'equity',    '^DJI'),
('^RUT',   'Russell 2000',     'americas', 'USA',        'USD', 'America/New_York',  'equity',    '^RUT'),
('^BVSP',  'Bovespa',          'americas', 'Brazil',     'BRL', 'America/Sao_Paulo', 'equity',    '^BVSP'),
('^MXX',   'IPC Mexico',       'americas', 'Mexico',     'MXN', 'America/Chicago',   'equity',    '^MXX'),
-- EMEA
('^FTSE',  'FTSE 100',         'emea',     'UK',         'GBP', 'Europe/London',     'equity',    '^FTSE'),
('^GDAXI', 'DAX 40',           'emea',     'Germany',    'EUR', 'Europe/Berlin',     'equity',    '^GDAXI'),
('^FCHI',  'CAC 40',           'emea',     'France',     'EUR', 'Europe/Paris',      'equity',    '^FCHI'),
('^AEX',   'AEX Amsterdam',    'emea',     'Netherlands','EUR', 'Europe/Amsterdam',  'equity',    '^AEX'),
('^STOXX50E','EURO STOXX 50',  'emea',     'EU',         'EUR', 'Europe/Frankfurt',  'equity',    '^STOXX50E'),
('^N100',  'Euronext 100',     'emea',     'EU',         'EUR', 'Europe/Paris',      'equity',    '^N100'),
-- Asia-Pacific
('^N225',  'Nikkei 225',       'asia',     'Japan',      'JPY', 'Asia/Tokyo',        'equity',    '^N225'),
('^HSI',   'Hang Seng',        'asia',     'Hong Kong',  'HKD', 'Asia/Hong_Kong',    'equity',    '^HSI'),
('000001.SS','Shanghai',       'asia',     'China',      'CNY', 'Asia/Shanghai',     'equity',    '000001.SS'),
('^AXJO',  'ASX 200',          'asia',     'Australia',  'AUD', 'Australia/Sydney',  'equity',    '^AXJO'),
('^KS11',  'KOSPI',            'asia',     'South Korea','KRW', 'Asia/Seoul',        'equity',    '^KS11'),
('^NSEI',  'NIFTY 50',         'asia',     'India',      'INR', 'Asia/Kolkata',      'equity',    '^NSEI'),
-- Safe Havens / Global
('GC=F',   'Gold Futures',     'global',   'Global',     'USD', 'America/New_York',  'commodity', 'GC=F'),
('^VIX',   'CBOE VIX',         'global',   'USA',        'USD', 'America/New_York',  'volatility','^VIX'),
('DX-Y.NYB','US Dollar Index', 'global',   'USA',        'USD', 'America/New_York',  'fx',        'DX-Y.NYB'),
('^TNX',   'US 10Y Treasury',  'global',   'USA',        'USD', 'America/New_York',  'bond',      '^TNX'),
('CL=F',   'Crude Oil WTI',    'global',   'Global',     'USD', 'America/New_York',  'commodity', 'CL=F'),
('SI=F',   'Silver Futures',   'global',   'Global',     'USD', 'America/New_York',  'commodity', 'SI=F')
ON CONFLICT (symbol) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- Price Data — Partitioned by Month for performance
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS price_data (
    id          BIGSERIAL,
    symbol      VARCHAR(20)  NOT NULL,
    ts          TIMESTAMPTZ  NOT NULL,
    open        NUMERIC(18,6),
    high        NUMERIC(18,6),
    low         NUMERIC(18,6),
    close       NUMERIC(18,6) NOT NULL,
    volume      BIGINT,
    adj_close   NUMERIC(18,6),
    PRIMARY KEY (symbol, ts)
) PARTITION BY RANGE (ts);

-- Create partitions for the last 13 months + next month
DO $$
DECLARE
    start_date DATE := DATE_TRUNC('month', NOW() - INTERVAL '12 months');
    end_date   DATE := DATE_TRUNC('month', NOW() + INTERVAL '2 months');
    cur        DATE := start_date;
    partition_name TEXT;
    next_month DATE;
BEGIN
    WHILE cur < end_date LOOP
        next_month := cur + INTERVAL '1 month';
        partition_name := 'price_data_' || TO_CHAR(cur, 'YYYY_MM');
        EXECUTE FORMAT(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF price_data FOR VALUES FROM (%L) TO (%L)',
            partition_name, cur, next_month
        );
        cur := next_month;
    END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_price_symbol_ts ON price_data (symbol, ts DESC);

-- ─────────────────────────────────────────────────────────────────
-- News with Vector Embeddings for RAG
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS news (
    id               BIGSERIAL PRIMARY KEY,
    headline         TEXT        NOT NULL,
    source           VARCHAR(100),
    url              TEXT,
    published_at     TIMESTAMPTZ NOT NULL,
    content          TEXT,
    sentiment        VARCHAR(20) CHECK (sentiment IN ('bullish','bearish','neutral')),
    sentiment_score  NUMERIC(5,4),    -- -1.0 to 1.0
    impact_score     SMALLINT CHECK (impact_score BETWEEN 0 AND 100),
    affected_symbols TEXT[],
    summary          TEXT,            -- AI "why it matters"
    embedding        vector(1024),    -- Cohere embed-english-v3.0
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_published_at ON news (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_sentiment     ON news (sentiment);
CREATE INDEX IF NOT EXISTS idx_news_impact        ON news (impact_score DESC);
CREATE INDEX IF NOT EXISTS idx_news_symbols       ON news USING GIN (affected_symbols);
-- IVFFlat index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_news_embedding     ON news USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_news_headline_trgm ON news USING GIN (headline gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────
-- Momentum Scores
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS momentum_scores (
    id                  BIGSERIAL PRIMARY KEY,
    symbol              VARCHAR(20)  NOT NULL,
    calculated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    price_momentum_1d   NUMERIC(10,4),
    price_momentum_3d   NUMERIC(10,4),
    price_momentum_1w   NUMERIC(10,4),
    price_momentum_1m   NUMERIC(10,4),
    price_momentum_3m   NUMERIC(10,4),
    volume_momentum     NUMERIC(10,4),    -- ratio vs 20-day avg
    relative_strength   NUMERIC(10,4),    -- vs sector/region
    composite_score     NUMERIC(10,4),
    percentile_rank     NUMERIC(5,2),     -- 0-100
    regime              VARCHAR(20) CHECK (regime IN ('surging','strong','neutral','weak','crashing')),
    ai_commentary       TEXT,
    data                JSONB,
    UNIQUE (symbol, calculated_at)
);

CREATE INDEX IF NOT EXISTS idx_momentum_calculated_at ON momentum_scores (calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_momentum_composite      ON momentum_scores (composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_momentum_regime         ON momentum_scores (regime);

-- ─────────────────────────────────────────────────────────────────
-- Watchlist
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS watchlist (
    id           SERIAL PRIMARY KEY,
    symbol       VARCHAR(20)  NOT NULL,
    name         VARCHAR(255),
    added_at     TIMESTAMPTZ  DEFAULT NOW(),
    notes        TEXT,
    target_price NUMERIC(18,6),
    stop_loss    NUMERIC(18,6),
    alerts       JSONB        DEFAULT '[]'::jsonb,
    is_active    BOOLEAN      DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_symbol ON watchlist (symbol) WHERE is_active;

-- Seed default watchlist
INSERT INTO watchlist (symbol, name) VALUES
('AAPL',  'Apple Inc'),
('NVDA',  'NVIDIA Corp'),
('MSFT',  'Microsoft Corp'),
('AMZN',  'Amazon.com Inc'),
('GOOGL', 'Alphabet Inc'),
('META',  'Meta Platforms'),
('TSLA',  'Tesla Inc'),
('JPM',   'JPMorgan Chase'),
('GLD',   'SPDR Gold ETF'),
('SPY',   'SPDR S&P 500 ETF')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- Trading Journal
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal (
    id             BIGSERIAL PRIMARY KEY,
    trade_date     DATE        NOT NULL,
    symbol         VARCHAR(20) NOT NULL,
    action         VARCHAR(10) NOT NULL CHECK (action IN ('buy','sell','short','cover','watch')),
    quantity       NUMERIC(18,6),
    price          NUMERIC(18,6),
    total_value    NUMERIC(18,2),
    strategy_tag   VARCHAR(100),         -- e.g. "momentum breakout", "mean reversion"
    rationale      TEXT,
    emotion        VARCHAR(50) CHECK (emotion IN ('confident','fearful','greedy','neutral','fomo','disciplined')),
    exit_price     NUMERIC(18,6),
    exit_date      DATE,
    pnl            NUMERIC(18,2),
    pnl_percent    NUMERIC(10,4),
    ai_review      TEXT,                 -- AI post-trade analysis
    lessons_learned TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_symbol     ON journal (symbol);
CREATE INDEX IF NOT EXISTS idx_journal_trade_date ON journal (trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_strategy   ON journal (strategy_tag);

-- ─────────────────────────────────────────────────────────────────
-- Morning Briefings
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS briefings (
    id               BIGSERIAL PRIMARY KEY,
    briefing_date    DATE        NOT NULL UNIQUE,
    content          TEXT        NOT NULL,
    provider         VARCHAR(50) NOT NULL,    -- cohere | cerebras | google
    market_snapshot  JSONB,                   -- market state at time of generation
    key_themes       TEXT[],
    risk_regime      VARCHAR(50),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_briefings_date ON briefings (briefing_date DESC);

-- ─────────────────────────────────────────────────────────────────
-- Alert System
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
    id           BIGSERIAL PRIMARY KEY,
    symbol       VARCHAR(20),
    alert_type   VARCHAR(50) NOT NULL CHECK (alert_type IN (
                     'price_above','price_below','price_change_pct',
                     'momentum_breakout','momentum_crash',
                     'sentiment_shift','vix_spike','cross_asset'
                 )),
    threshold    NUMERIC(18,6),
    condition    JSONB DEFAULT '{}'::jsonb,
    is_active    BOOLEAN     DEFAULT true,
    triggered_at TIMESTAMPTZ,
    message      TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_symbol    ON alerts (symbol);
CREATE INDEX IF NOT EXISTS idx_alerts_active    ON alerts (is_active) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_alerts_triggered ON alerts (triggered_at DESC);

-- ─────────────────────────────────────────────────────────────────
-- API Usage Tracking (for quota management)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_usage (
    id           BIGSERIAL PRIMARY KEY,
    provider     VARCHAR(50) NOT NULL,
    endpoint     VARCHAR(100),
    tokens_used  INTEGER     DEFAULT 0,
    cost_estimate NUMERIC(10,6) DEFAULT 0,
    model        VARCHAR(100),
    task_type    VARCHAR(100),
    ts           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_provider ON api_usage (provider, ts DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_ts       ON api_usage (ts DESC);

-- ─────────────────────────────────────────────────────────────────
-- Economic Calendar
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS economic_calendar (
    id          BIGSERIAL PRIMARY KEY,
    event_date  TIMESTAMPTZ NOT NULL,
    country     VARCHAR(10),
    event_name  TEXT        NOT NULL,
    impact      VARCHAR(10) CHECK (impact IN ('low','medium','high')),
    forecast    TEXT,
    previous    TEXT,
    actual      TEXT,
    source      VARCHAR(50),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_econ_cal_date ON economic_calendar (event_date);

-- ─────────────────────────────────────────────────────────────────
-- Helper: auto-update updated_at
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_journal_updated_at
    BEFORE UPDATE ON journal
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────────
-- View: Latest momentum scores per symbol
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW latest_momentum AS
SELECT DISTINCT ON (symbol)
    ms.*,
    i.name,
    i.region,
    i.asset_class
FROM momentum_scores ms
JOIN indices i ON i.symbol = ms.symbol
ORDER BY symbol, calculated_at DESC;

-- ─────────────────────────────────────────────────────────────────
-- View: Latest price per symbol
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW latest_prices AS
SELECT DISTINCT ON (symbol)
    pd.symbol,
    pd.ts,
    pd.open,
    pd.high,
    pd.low,
    pd.close,
    pd.volume,
    pd.adj_close,
    i.name,
    i.region,
    i.currency,
    i.asset_class
FROM price_data pd
JOIN indices i ON i.symbol = pd.symbol
ORDER BY symbol, ts DESC;

ANALYZE;
