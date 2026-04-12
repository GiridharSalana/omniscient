# Omniscient — Market Intelligence Terminal

A Docker-first personal market intelligence platform — a free alternative to Bloomberg Terminal for solo traders. Built with AI-powered analysis using Cohere, Cerebras, and Google AI on entirely free tiers.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend  :3000   Next.js 14 + TypeScript + Tailwind       │
│  Backend   :8000   Python FastAPI + Smart LLM Router        │
│  Postgres  :5432   PostgreSQL 15 + pgvector (RAG)          │
│  Redis     :6379   Cache + Quota tracking + Pub/Sub         │
│  Scheduler  —      Cron: prices/5min, news/10min, etc.      │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
cd /path/to/omniscient
docker compose up -d
```

Dashboard: **http://localhost:3000**  
API Docs:  **http://localhost:8000/docs**

## Free API Keys

| Service | URL | Limit | Used For |
|---------|-----|-------|---------|
| Cohere | cohere.com | 1,000/month | Briefings, sentiment, embeddings |
| Cerebras | cerebras.ai | ~1,000/day | Chat (sub-second speed) |
| Google AI | makersuite.google.com | 1,500/day | Fallback LLM |
| Yahoo Finance | — | Unlimited | Price data (primary) |
| Finnhub | finnhub.io | 60/min | News, calendar |
| MarketAux | marketaux.com | 250/day | News with sentiment |
| Alpha Vantage | alphavantage.co | 25/day | Supplemental quotes |
| FRED | fred.stlouisfed.org | Unlimited | Macro indicators |

## AI Routing Logic

```
Morning Briefing  → Cohere Command R  (quality)
Sentiment Batch   → Cohere Classify   (50 headlines = 1 call)
Chat / QA         → Cerebras 70B      (sub-second speed)
Code Generation   → Cerebras / Google
Overflow          → Google Gemini Flash

Fallback chain: Cohere → Cerebras → Google → cached response
Quota tracking: Redis counters with daily/monthly TTLs
```

## Features

- **Global Pulse Dashboard** — World markets with symmetrical 2×2 grids per region
- **Morning Briefing** — Auto-generated at 6 AM IST via Cohere, Telegram delivery optional  
- **News Intelligence** — Aggregate + batch sentiment + vector embeddings (pgvector RAG)
- **Momentum Matrix** — Multi-factor scanner: ROC(1d/1w/1m/3m) + volume + relative strength
- **AI Chat** — Natural language with RAG: "Why is tech down?" → vector search + synthesis
- **Trading Journal** — Log trades, AI post-trade reviews, pattern recognition
- **Alert System** — Price levels, VIX spikes, cross-asset anomalies via WebSocket

## Automation Schedule

| When | Job |
|------|-----|
| Every 5 min | Ingest prices (Yahoo Finance) |
| Every 10 min | Fetch news + sentiment + embeddings |
| Every 30 min | Recalculate momentum scores |
| 6:00 AM IST | Generate morning briefing |
| Midnight | Cleanup + archive + ANALYZE |

## Layout Design

All UI components follow strict symmetry rules:
- **Equal columns**: 2-sym, 3-sym, or 6-6 grids only. Never asymmetric.
- **Uniform spacing**: 4px, 8px, 16px, 24px, 32px tokens only
- **Centered headers**: All section titles use `section-header` class
- **Mirrored tables**: Leaders/Laggards, Americas/Asia use identical table structures
- **Consistent cards**: Same border weight (1px #1c2030), same border-radius (8px)

## Management

```bash
# View logs
docker compose logs -f backend
docker compose logs -f scheduler

# Restart a service
docker compose restart backend

# Trigger manual briefing
curl -X POST http://localhost:8000/api/v1/briefing/generate

# Check quota status
curl http://localhost:8000/health

# Stop everything
docker compose down

# Full reset (delete data)
docker compose down -v
```
