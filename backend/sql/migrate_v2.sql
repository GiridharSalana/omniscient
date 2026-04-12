-- ─────────────────────────────────────────────────────────────────
-- Migration v2 — Users, Preferences, India Indices
-- Run via: POST /api/v1/init/migrate-v2
-- ─────────────────────────────────────────────────────────────────

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    email       VARCHAR(255) UNIQUE NOT NULL,
    username    VARCHAR(100) UNIQUE NOT NULL,
    hashed_pw   VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    markets     JSONB   NOT NULL DEFAULT '["india","americas","emea","asia"]',
    watchlist   JSONB   NOT NULL DEFAULT '[]',
    home_region VARCHAR(50)  DEFAULT 'india',
    theme       VARCHAR(20)  DEFAULT 'dark',
    updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- Additional India indices
INSERT INTO indices (symbol, name, region, country, currency, timezone, asset_class, yahoo_symbol) VALUES
('^BSESN',   'BSE SENSEX',     'asia', 'India', 'INR', 'Asia/Kolkata', 'equity',     '^BSESN'),
('^NSEBANK', 'NIFTY Bank',     'asia', 'India', 'INR', 'Asia/Kolkata', 'equity',     '^NSEBANK'),
('^CNXIT',   'NIFTY IT',       'asia', 'India', 'INR', 'Asia/Kolkata', 'equity',     '^CNXIT'),
('^INDIAVIX','India VIX',      'asia', 'India', 'INR', 'Asia/Kolkata', 'volatility', '^INDIAVIX'),
('USDINR=X', 'USD/INR',        'asia', 'India', 'INR', 'Asia/Kolkata', 'fx',         'USDINR=X')
ON CONFLICT (symbol) DO NOTHING;

-- Add country column to indices if missing (for filter UI)
ALTER TABLE indices ADD COLUMN IF NOT EXISTS is_india BOOLEAN GENERATED ALWAYS AS (country = 'India') STORED;
