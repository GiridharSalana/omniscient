# Omniscient — Trading Platform TODO

> Goal: Transform the site from an information display into a **decision tool** that answers
> the 7 questions every trader asks each morning.

---

## Phase 1 — Fix the Foundation `HIGH IMPACT · Week 1`

**India-first dashboard**
- [ ] Add Nifty 50, Bank Nifty, Sensex as the top row (above Americas/APAC)
- [ ] Add India VIX gauge to dashboard header area
- [ ] Pull NSE indices data via Yahoo Finance (^NSEI, ^NSEBANK, ^BSESN, ^INDIAVIX)

**NSE Sector Heatmap**
- [ ] Add sector heatmap component: IT / Banking / Pharma / Auto / Metal / Energy / FMCG / Realty
- [ ] Color each cell by 1D % change (red → green gradient)
- [ ] Click on sector → show top 5 movers in that sector
- [ ] Backend: add `/api/market/sectors` endpoint pulling sector ETF / index data

**Economic Calendar widget on Dashboard**
- [ ] Show next 7 days of events: RBI policy, FOMC, CPI India, NFP, Nifty/Bank Nifty expiry
- [ ] Color-code by importance (high/medium/low impact)
- [ ] Backend: scrape/fetch economic calendar from free source (Investing.com RSS or hardcoded schedule)

**Watchlist sparklines**
- [ ] Replace plain price rows with mini 7-day sparkline charts (Lightweight Charts micro version)
- [ ] Make every watchlist row clickable → navigate to `/stock/[symbol]`
- [ ] Add % change color coding (green/red) and volume indicator dot

**Momentum Scanner expansion**
- [ ] Expand default symbol universe from 3 → full Nifty 50 + user watchlist (50+ symbols)
- [ ] Backend: pre-compute momentum scores for all Nifty 50 symbols in scheduler
- [ ] Show top 10 leaders and top 10 laggards on dashboard, full list on Momentum page

---

## Phase 2 — Stock Screener `MOST VALUABLE FEATURE · Week 1`

**New page: `/screener`**
- [ ] Add "Screener" to top navigation bar
- [ ] Results table: Symbol, Price, 1D%, Volume, RSI, Trend Signal, Regime badge
- [ ] Click any row → go to `/stock/[symbol]`

**Preset scans (one-click filters)**
- [ ] Momentum Breakouts — 1D gain > 2%, volume > 1.5x average
- [ ] Oversold Bounce — RSI < 30, price above 200 SMA
- [ ] 52-Week High Breakers — within 1% of 52w high
- [ ] Volume Surge — volume > 3x average with price up
- [ ] Gap Up — opened > 1% above prior close
- [ ] Gap Down — opened > 1% below prior close
- [ ] Strong Uptrend — price above SMA20 > SMA50 > SMA200

**Custom filter builder**
- [ ] Filter by: RSI range, price range, volume multiplier, % change range, regime
- [ ] Save custom filters to localStorage
- [ ] Sort results by any column

**Backend**
- [ ] `/api/screener/run?preset=momentum_breakout` endpoint
- [ ] `/api/screener/custom` endpoint with filter params
- [ ] Pre-cache technical snapshots for all Nifty 50 + watchlist symbols in Redis

---

## Phase 3 — India-Specific Intelligence `UNIQUE VALUE · Week 2`

**FII/DII Flow Panel**
- [ ] New dashboard card showing: FII net (cash), DII net (cash), combined signal
- [ ] Color: both buying = strong green, FII selling + DII buying = neutral, both selling = red
- [ ] Historical 5-day trend bar chart
- [ ] Backend: fetch from NSE/moneycontrol daily at 5 PM IST via scheduler
- [ ] Store in DB: `fii_dii_data(date, fii_net, dii_net, segment)`

**Nifty PCR (Put-Call Ratio)**
- [ ] Display current PCR on dashboard
- [ ] Gauge: < 0.6 = Oversold/Bounce, 0.6–1.0 = Neutral, 1.0–1.3 = Cautious, > 1.3 = Overbought
- [ ] 10-day PCR trend line chart
- [ ] Backend: fetch from NSE options chain data

**India VIX detailed view**
- [ ] VIX gauge on dashboard (already planned in Phase 1, expand here)
- [ ] VIX level interpretation: < 13 = calm, 13–20 = normal, 20–25 = elevated, > 25 = fear
- [ ] Historical VIX chart on Macro page

**F&O Expiry calendar**
- [ ] Countdown to next weekly expiry (Thursday) and monthly expiry
- [ ] Show in Economic Calendar widget
- [ ] Highlight expiry week with warning indicator

**Nifty Max Pain**
- [ ] Calculate max pain level from options OI data
- [ ] Display on dashboard: "Max Pain: 23,450 | Current: 23,800 | Diff: +350"
- [ ] Backend: `/api/market/maxpain` endpoint

---

## Phase 4 — Portfolio + Risk Management `RETENTION FEATURE · Week 2`

**Portfolio Tracker**
- [ ] New page: `/portfolio`
- [ ] Add "Portfolio" to navigation
- [ ] Form: Add holding (symbol, quantity, avg buy price, date)
- [ ] Table: Symbol, Qty, Avg Price, CMP, P&L ₹, P&L %, Value, Allocation %
- [ ] Summary row: Total invested, Current value, Total P&L, Overall return %
- [ ] Allocation pie chart by symbol and by sector
- [ ] Backend: `portfolio_holdings` DB table + CRUD endpoints

**Benchmark comparison**
- [ ] Compare portfolio return vs Nifty 50 return since oldest holding date
- [ ] Show alpha: "Your portfolio: +12.3% | Nifty: +8.1% | Alpha: +4.2%"

**Position Sizer calculator**
- [ ] Standalone calculator widget (on Portfolio page or Journal)
- [ ] Inputs: Capital (₹), Risk % per trade, Entry price, Stop loss price
- [ ] Output: Position size (shares), Risk amount (₹), Risk-reward if target entered
- [ ] Formula: Shares = (Capital × Risk%) / (Entry - Stop)

**Journal improvements**
- [ ] Link journal entries to portfolio holdings
- [ ] Show entry/exit price markers on the stock chart when viewing a journaled trade
- [ ] Add trade outcome stats: avg win, avg loss, profit factor, expectancy
- [ ] Export journal to CSV

---

## Phase 5 — Smart Alerts `AUTOMATION · Week 3`

**Price level alerts**
- [ ] Alert form: Symbol + condition (above/below) + price + notification method
- [ ] Store in DB: `alerts(symbol, condition, target_price, triggered, created_at)`
- [ ] Backend: check alerts every 5 min in scheduler, mark triggered

**Technical alerts**
- [ ] RSI threshold: "Alert when RELIANCE RSI drops below 30"
- [ ] MA crossover: "Alert when HDFC crosses above SMA50"
- [ ] Volume spike: "Alert when volume > 3x average"

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
- [ ] Stock detail page is hidden — add "View Chart" button from every symbol mention
- [ ] Add keyboard shortcuts: `/` to search symbols, `J` for journal, `S` for screener
- [ ] Mobile responsive audit — fix any broken layouts on small screens
- [ ] Loading skeletons for all data-fetching components

**Performance**
- [ ] Redis cache all slow API calls (sector data, macro, FII/DII)
- [ ] Lazy-load Lightweight Charts (already done on stock page, ensure everywhere)
- [ ] Pagination on news feed and screener results

**Data health**
- [ ] Add API quota dashboard in Settings (show remaining calls for each provider)
- [ ] Error states for all widgets when API fails (graceful fallback)
- [ ] Add "last updated" timestamp to every data panel

---

## Questions Before Starting

- [ ] Are you trading mostly **Indian markets (NSE/BSE)**, global markets, or both?
- [ ] Are you a **day trader**, swing trader, or long-term investor? (affects what to prioritize)
- [ ] Do you want **Indian stocks** (RELIANCE, HDFC, INFY) in the screener or only global (AAPL, AMZN)?
- [ ] Should the portfolio tracker use **INR (₹)** as primary currency?

---

## Progress

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 — Foundation | ✅ Done | India-first dashboard, sparklines, econ bar, momentum |
| Phase 2 — Screener | ✅ Done | 8 preset scans, 69 symbols, RSI/Vol/Signal table |
| Phase 3 — India Intelligence | ✅ Done | PCR/FII-DII panel, F&O expiry calendar, Max Pain |
| Phase 4 — Portfolio + Risk | ✅ Done | Portfolio tracker, live P&L, position sizer calc |
| Phase 5 — Alerts | ✅ Done | 6 alert types, full CRUD UI, check engine |
| Phase 6 — UI Overhaul | ✅ Done | Deeper colors, better cards, purple buttons, glow effects |
