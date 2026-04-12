"""
Omniscient — FastAPI Backend
Market intelligence platform for solo traders.
"""
from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Any

import redis.asyncio as aioredis
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

from llm_router import LLMRouter
from models.schemas import HealthResponse, ServiceHealth

# ─────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level    = os.getenv("LOG_LEVEL", "INFO"),
    format   = "%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    datefmt  = "%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://omniscient:omniscient_secret@postgres:5432/omniscient",
)
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

APP_START = time.time()

# ─────────────────────────────────────────────────────────────────
# Database engine (shared across requests)
# ─────────────────────────────────────────────────────────────────
engine = create_async_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    echo=False,
)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


# ─────────────────────────────────────────────────────────────────
# Redis client (shared)
# ─────────────────────────────────────────────────────────────────
redis_client: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    return redis_client


# ─────────────────────────────────────────────────────────────────
# LLM Router (shared)
# ─────────────────────────────────────────────────────────────────
llm_router: LLMRouter | None = None


def get_llm() -> LLMRouter:
    return llm_router


# ─────────────────────────────────────────────────────────────────
# WebSocket connection manager
# ─────────────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, channel: str):
        await websocket.accept()
        self.active.setdefault(channel, []).append(websocket)
        logger.debug("WS client connected to channel: %s", channel)

    def disconnect(self, websocket: WebSocket, channel: str):
        conns = self.active.get(channel, [])
        if websocket in conns:
            conns.remove(websocket)

    async def broadcast(self, channel: str, data: Any):
        dead = []
        for ws in self.active.get(channel, []):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, channel)


ws_manager = ConnectionManager()


# ─────────────────────────────────────────────────────────────────
# Lifespan — startup / shutdown
# ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client, llm_router

    logger.info("Starting Omniscient backend...")

    # Connect Redis
    redis_client = await aioredis.from_url(REDIS_URL, decode_responses=True)
    await redis_client.ping()
    logger.info("Redis connected.")

    # Init LLM router
    llm_router = LLMRouter(
        cohere_key   = os.getenv("COHERE_API_KEY"),
        cerebras_key = os.getenv("CEREBRAS_API_KEY"),
        google_key   = os.getenv("GOOGLE_AI_API_KEY"),
        redis_url    = REDIS_URL,
    )

    logger.info("LLM router initialized.")

    yield  # Application runs here

    # Cleanup
    await redis_client.aclose()
    await llm_router.close()
    await engine.dispose()
    logger.info("Omniscient backend shut down cleanly.")


# ─────────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────────
app = FastAPI(
    title       = "Omniscient API",
    description = "Market intelligence platform for solo traders",
    version     = "1.0.0",
    lifespan    = lifespan,
    docs_url    = "/docs",
    redoc_url   = "/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["http://localhost:3000", "http://frontend:3000"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ─────────────────────────────────────────────────────────────────
# Import and include routers
# ─────────────────────────────────────────────────────────────────
from routers import market, news, momentum, chat, journal, alerts, briefing, init_router
from routers import macro, technical, auth, users, stock, ml_predict, screener, india, portfolio

app.include_router(auth.router,        prefix="/api/v1/auth",      tags=["Auth"])
app.include_router(users.router,       prefix="/api/v1/users",     tags=["Users"])
app.include_router(market.router,      prefix="/api/v1/market",    tags=["Market Data"])
app.include_router(news.router,        prefix="/api/v1/news",      tags=["News"])
app.include_router(momentum.router,    prefix="/api/v1/momentum",  tags=["Momentum"])
app.include_router(chat.router,        prefix="/api/v1/chat",      tags=["AI Chat"])
app.include_router(journal.router,     prefix="/api/v1/journal",   tags=["Journal"])
app.include_router(alerts.router,      prefix="/api/v1/alerts",    tags=["Alerts"])
app.include_router(briefing.router,    prefix="/api/v1/briefing",  tags=["Briefing"])
app.include_router(init_router.router, prefix="/api/v1/init",      tags=["Setup"])
app.include_router(macro.router,       prefix="/api/v1/macro",     tags=["Macro Intelligence"])
app.include_router(technical.router,   prefix="/api/v1/technical", tags=["Technical Analysis"])
app.include_router(stock.router,       prefix="/api/v1/stock",     tags=["Stock Deep Dive"])
app.include_router(ml_predict.router,  prefix="/api/v1/stock",     tags=["ML Prediction"])
app.include_router(screener.router,    prefix="/api/v1/screener",  tags=["Stock Screener"])
app.include_router(india.router,       prefix="/api/v1/india",     tags=["India Intelligence"])
app.include_router(portfolio.router,   prefix="/api/v1/portfolio", tags=["Portfolio"])


# ─────────────────────────────────────────────────────────────────
# Health check
# ─────────────────────────────────────────────────────────────────
@app.get("/health", response_model=HealthResponse)
async def health():
    services: dict[str, ServiceHealth] = {}

    # Check PostgreSQL
    try:
        t0 = time.monotonic()
        async with AsyncSessionLocal() as s:
            await s.execute(text("SELECT 1"))
        services["postgres"] = ServiceHealth(status="ok", latency=round((time.monotonic()-t0)*1000, 1))
    except Exception as e:
        services["postgres"] = ServiceHealth(status="down", message=str(e))

    # Check Redis
    try:
        t0 = time.monotonic()
        await redis_client.ping()
        services["redis"] = ServiceHealth(status="ok", latency=round((time.monotonic()-t0)*1000, 1))
    except Exception as e:
        services["redis"] = ServiceHealth(status="down", message=str(e))

    # LLM provider quota status
    if llm_router:
        quota = await llm_router.get_quota_status()
        for provider, info in quota.items():
            services[f"llm_{provider}"] = ServiceHealth(
                status  = "ok" if info["available"] else ("degraded" if info["limit"] > 0 else "down"),
                message = f"{info['remaining']} calls remaining",
            )

    overall = "ok" if all(s.status == "ok" for s in services.values() if s.status != "down"
                          and not list(services.keys())[list(services.values()).index(s)].startswith("llm_")) \
              else "degraded"

    return HealthResponse(
        status   = overall,
        version  = "1.0.0",
        services = services,
        uptime_s = round(time.time() - APP_START, 1),
    )


# ─────────────────────────────────────────────────────────────────
# WebSocket endpoints
# ─────────────────────────────────────────────────────────────────
@app.websocket("/ws/prices")
async def ws_prices(websocket: WebSocket):
    await ws_manager.connect(websocket, "prices")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, "prices")


@app.websocket("/ws/alerts")
async def ws_alerts(websocket: WebSocket):
    await ws_manager.connect(websocket, "alerts")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, "alerts")


@app.get("/")
async def root():
    return {"message": "Omniscient API — see /docs for endpoints"}
