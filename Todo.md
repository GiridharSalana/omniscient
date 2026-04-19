# Omniscient — Trading Platform TODO

> Goal: Transform the site from an information display into a **decision tool** that answers
> the 7 questions every trader asks each morning.

---

## Phase 1 — Fix the Foundation `HIGH IMPACT · Week 1`

**India-first dashboard**
- [x] Add Nifty 50, Bank Nifty, Sensex as the top row (above Americas/APAC)
- [x] Add India VIX gauge to dashboard header area
- [x] Pull NSE indices data via Yahoo Finance (^NSEI, ^NSEBANK, ^BSESN, ^INDIAVIX)

**NSE Sector Heatmap**
- [x] Add sector heatmap component: IT / Banking / Pharma / Auto / Metal / Energy / FMCG / Realty
- [x] Color each cell by 1D % change (red → green gradient)
- [ ] Click on sector → show top 5 movers in that sector
- [x] Backend: add `/api/market/sectors` endpoint pulling sector ETF / index data

**Economic Calendar widget on Dashboard**
- [x] Show next 7 days of events: RBI policy, FOMC, CPI India, NFP, Nifty/Bank Nifty expiry
- [x] Color-code by importance (high/medium/low impact)
- [x] Backend: scrape/fetch economic calendar from free source

**Watchlist sparklines**
- [x] Replace plain price rows with mini 7-day sparkline charts
- [x] Make every watchlist row clickable → navigate to `/stock/[symbol]`
- [x] Add % change color coding (green/red) and volume indicator dot

**Momentum Scanner expansion**
- [x] Expand default symbol universe from 3 → full Nifty 50 + user watchlist (50+ symbols)
- [x] Backend: pre-compute momentum scores for all Nifty 50 symbols in scheduler
- [x] Show top 10 leaders and top 10 laggards on dashboard, full list on Momentum page

---

## Phase 2 — Stock Screener `MOST VALUABLE FEATURE · Week 1`

**New page: `/screener`**
- [x] Add "Screener" to top navigation bar
- [x] Results table: Symbol, Price, 1D%, Volume, RSI, Trend Signal, Regime badge
- [x] Click any row → go to `/stock/[symbol]`

**Preset scans (one-click filters)**
- [x] Momentum Breakouts — 1D gain > 2%, volume > 1.5x average
- [x] Oversold Bounce — RSI < 30, price above 200 SMA
- [x] 52-Week High Breakers — within 1% of 52w high
- [x] Volume Surge — volume > 3x average with price up
- [x] Gap Up — opened > 1% above prior close
- [x] Gap Down — opened > 1% below prior close
- [x] Strong Uptrend — price above SMA20 > SMA50 > SMA200
- [x] Golden Cross — SMA50 crossed above SMA200

**Custom filter builder**
- [ ] Filter by: RSI range, price range, volume multiplier, % change range, regime
- [ ] Save custom filters to localStorage
- [x] Sort results by any column

**Backend**
- [x] `/api/screener/run?preset=momentum_breakout` endpoint
- [ ] `/api/screener/custom` endpoint with filter params
- [x] Pre-cache technical snapshots for all Nifty 50 + watchlist symbols in Redis

---

## Phase 3 — India-Specific Intelligence `UNIQUE VALUE · Week 2`

**FII/DII Flow Panel**
- [x] New dashboard card showing: FII net (cash), DII net (cash), combined signal
- [x] Color: both buying = strong green, FII selling + DII buying = neutral, both selling = red
- [x] Historical 5-day trend bar chart
- [x] Backend: fetch from NSE/moneycontrol daily at 5 PM IST via scheduler
- [x] Store in DB: `fii_dii_data(date, fii_net, dii_net, segment)`

**Nifty PCR (Put-Call Ratio)**
- [x] Display current PCR on dashboard
- [x] Gauge: < 0.6 = Oversold/Bounce, 0.6–1.0 = Neutral, 1.0–1.3 = Cautious, > 1.3 = Overbought
- [ ] 10-day PCR trend line chart

**India VIX detailed view**
- [x] VIX gauge on dashboard (India VIX + US VIX in market pulse bar)
- [x] VIX level interpretation: < 13 = calm, 13–20 = normal, 20–25 = elevated, > 25 = fear
- [ ] Historical VIX chart on Macro page

**F&O Expiry calendar**
- [x] Countdown to next weekly expiry (Thursday) and monthly expiry
- [x] Show in Economic Calendar widget
- [ ] Highlight expiry week with warning indicator

**Nifty Max Pain**
- [x] Calculate max pain level from options OI data
- [x] Display on dashboard: "Max Pain: 23,450 | Current: 23,800 | Diff: +350"
- [x] Backend: `/api/market/maxpain` endpoint

---

## Phase 4 — Portfolio + Risk Management `RETENTION FEATURE · Week 2`

**Portfolio Tracker**
- [x] New page: `/portfolio`
- [x] Add "Portfolio" to navigation
- [x] Form: Add holding (symbol, quantity, avg buy price, date)
- [x] Table: Symbol, Qty, Avg Price, CMP, P&L ₹, P&L %, Value, Allocation %
- [x] Summary row: Total invested, Current value, Total P&L, Overall return %
- [x] Allocation pie chart by symbol and by sector
- [x] Backend: `portfolio_holdings` DB table + CRUD endpoints

**Benchmark comparison**
- [ ] Compare portfolio return vs Nifty 50 return since oldest holding date
- [ ] Show alpha: "Your portfolio: +12.3% | Nifty: +8.1% | Alpha: +4.2%"

**Position Sizer calculator**
- [x] Standalone calculator widget (on Portfolio page)
- [x] Inputs: Capital (₹), Risk % per trade, Entry price, Stop loss price
- [x] Output: Position size (shares), Risk amount (₹), Risk-reward if target entered
- [x] Formula: Shares = (Capital × Risk%) / (Entry - Stop)

**Journal improvements**
- [ ] Link journal entries to portfolio holdings
- [ ] Show entry/exit price markers on the stock chart when viewing a journaled trade
- [x] Add trade outcome stats: avg win, avg loss, profit factor, expectancy
- [ ] Export journal to CSV

---

## Phase 5 — Smart Alerts `AUTOMATION · Week 3`

**Price level alerts**
- [x] Alert form: Symbol + condition (above/below) + price + notification method
- [x] Store in DB: `alerts(symbol, condition, target_price, triggered, created_at)`
- [x] Backend: check alerts every 5 min in scheduler, mark triggered

**Technical alerts**
- [x] RSI threshold: "Alert when RSI drops below 30"
- [ ] MA crossover: "Alert when stock crosses above SMA50"
- [x] Volume spike: "Alert when volume > 3x average"

**Telegram integration**
- [ ] Wire up `TELEGRAM_BOT_TOKEN` (already in `.env`)
- [ ] Send alert messages: price hit, volume spike, morning briefing summary
- [ ] Send daily 9:00 AM IST digest: FII/DII, PCR, top movers, today's events

**In-app notifications**
- [ ] Toast notification when alert triggers while app is open
- [ ] Notification bell icon in top nav with unread count
- [ ] Alert history log

---

## Phase 6 — Polish + Performance `Week 3`

**UX fixes**
- [x] Stock detail page — "View Chart" button from every symbol mention (clickable rows)
- [ ] Add keyboard shortcuts: `/` to search symbols, `J` for journal, `S` for screener
- [ ] Mobile responsive audit — fix any broken layouts on small screens
- [x] Loading skeletons for all data-fetching components

**Performance**
- [x] Redis cache all slow API calls (sector data, macro, FII/DII)
- [x] Lazy-load Lightweight Charts on stock page
- [ ] Pagination on news feed and screener results

**Data health**
- [ ] Add API quota dashboard in Settings (show remaining calls for each provider)
- [x] Error states for all widgets when API fails (graceful fallback)
- [ ] Add "last updated" timestamp to every data panel

---

## UI Improvements Completed (Apr 2026)

- [x] Fixed orphaned last card in 3-column grids (Opportunities, News, Journal, Screener)
- [x] Normalized page padding to `p-3 space-y-3` across all pages
- [x] Added Bank Nifty + India VIX to the market pulse bar on Opportunities page
- [x] Fixed all page headers to use 3-col grid layout (perfectly centred)
- [x] Fixed hardcoded dark-mode colors in Settings, Macro page to use CSS variables
- [x] Fixed Journal Net P&L currency symbol ($ → ₹)
- [x] Alerts grid: orphan alert card now spans full width
- [x] Stats bar made responsive (5-col on desktop, 3-col on mobile)
- [x] Stock detail page (`/stock/[symbol]`) — removed hardcoded dark colors, replaced with CSS theme variables (news cards now readable in light theme)
- [x] Stock detail page — Technical/Fundamentals/Prediction cards now use responsive grid (2-col or 3-col depending on data) and span full width instead of `maxWidth: 420`
- [x] Stock detail page — chart height increased to 360px, chart grid/border colors pulled from theme variables so they adapt to light/dark
- [x] Journal empty state — replaced hardcoded dark gradient + white text with theme-aware background + text-primary (readable in both themes)
- [x] Journal stats bar — replaced hardcoded dark-gradient card backgrounds and fixed hex colors with CSS theme variables
- [x] AI Chat page — rendered the full Suggestion Categories grid (Momentum, Macro, Risk, Technical, Fundamentals, News) inside the empty state so the page no longer looks empty; each suggestion is clickable and sends the prompt
- [x] Chat page RAG toggle — replaced hardcoded `bg-[#1a3050]` with theme vars

---

## Questions Before Starting

- [x] Are you trading mostly **Indian markets (NSE/BSE)**, global markets, or both? → India-first
- [x] Are you a **day trader**, swing trader, or long-term investor? → Swing/positional
- [x] Do you want **Indian stocks** (RELIANCE, HDFC, INFY) in the screener or only global? → Both (69 symbols)
- [x] Should the portfolio tracker use **INR (₹)** as primary currency? → Yes

---

## Progress

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 — Foundation | ✅ Done | India-first dashboard, sparklines, econ bar, momentum |
| Phase 2 — Screener | ✅ Done | 8 preset scans, 69 symbols, RSI/Vol/Signal table |
| Phase 3 — India Intelligence | ✅ Done | PCR/FII-DII panel, F&O expiry calendar, Max Pain |
| Phase 4 — Portfolio + Risk | ✅ Done | Portfolio tracker, live P&L, position sizer calc |
| Phase 5 — Alerts | 🟡 Partial | 6 alert types, CRUD UI ✓ — Telegram + toast notifications pending |
| Phase 6 — Polish | 🟡 Partial | Grid layouts fixed, padding normalized — keyboard shortcuts + mobile pending |

## Pending (Next Up)

- [ ] Telegram alert delivery (BOT_TOKEN already in .env — just needs wiring)
- [ ] Toast notifications when alerts trigger in-app
- [ ] Keyboard shortcuts (`/` search, `J` journal, `S` screener)
- [ ] Sector drill-down: click sector → top 5 movers
- [ ] Benchmark comparison on Portfolio page (vs Nifty 50)
- [ ] Portfolio journal trade linking
- [ ] Historical VIX + PCR trend charts on Macro page
- [ ] API quota dashboard in Settings
