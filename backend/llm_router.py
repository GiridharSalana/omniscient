"""
Smart LLM Router — routes to optimal provider based on task type and quota.

Verified working models (April 2026):
  Cohere:   command-r-plus-08-2024  via v2/chat API
            embed-english-v3.0      via v2/embed API
            (Classify API removed Sep 2025 — replaced with chat-based)
  Cerebras: llama3.1-8b             via OpenAI-compatible API
  Google:   gemini-flash-lite-latest via v1beta REST

Routing:
  Morning briefing → Cohere   (quality)
  Chat / QA        → Cerebras (speed, ~140ms)
  Fallback         → Google gemini-flash-lite
  Embeddings       → Cohere embed-english-v3.0 (1024-dim)
"""
from __future__ import annotations

import logging
import time
from datetime import datetime
from enum import Enum
from typing import Optional

import httpx
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

REDIS_URL = "redis://redis:6379/0"

# Verified model names
COHERE_CHAT_MODEL  = "command-r-plus-08-2024"
COHERE_EMBED_MODEL = "embed-english-v3.0"
CEREBRAS_MODEL     = "llama3.1-8b"
GOOGLE_MODEL       = "gemini-flash-lite-latest"


class TaskType(str, Enum):
    MORNING_BRIEFING = "morning_briefing"
    SENTIMENT_BATCH  = "sentiment_batch"
    CHAT_QA          = "chat_qa"
    CODE_GENERATION  = "code_generation"
    EMERGENCY        = "emergency"
    EMBEDDING        = "embedding"
    SUMMARIZE        = "summarize"


class Provider(str, Enum):
    COHERE   = "cohere"
    CEREBRAS = "cerebras"
    GOOGLE   = "google"


QUOTA_LIMITS: dict[str, dict] = {
    Provider.COHERE:   {"monthly": 1000, "redis_key": "quota:cohere:{year_month}",  "window": "monthly"},
    Provider.CEREBRAS: {"daily":   1000, "redis_key": "quota:cerebras:{date}",      "window": "daily"},
    Provider.GOOGLE:   {"daily":   1500, "redis_key": "quota:google:{date}",         "window": "daily"},
}

TASK_ROUTING: dict[str, list[str]] = {
    TaskType.MORNING_BRIEFING: [Provider.COHERE,   Provider.CEREBRAS, Provider.GOOGLE],
    TaskType.SENTIMENT_BATCH:  [Provider.CEREBRAS, Provider.COHERE,   Provider.GOOGLE],
    TaskType.CHAT_QA:          [Provider.CEREBRAS, Provider.GOOGLE,   Provider.COHERE],
    TaskType.CODE_GENERATION:  [Provider.CEREBRAS, Provider.GOOGLE,   Provider.COHERE],
    TaskType.EMERGENCY:        [Provider.CEREBRAS, Provider.GOOGLE,   Provider.COHERE],
    TaskType.SUMMARIZE:        [Provider.COHERE,   Provider.CEREBRAS, Provider.GOOGLE],
}


class QuotaExhausted(Exception):
    pass


class LLMRouter:

    def __init__(
        self,
        cohere_key:   Optional[str] = None,
        cerebras_key: Optional[str] = None,
        google_key:   Optional[str] = None,
        redis_url:    str = REDIS_URL,
    ):
        self.keys = {
            Provider.COHERE:   cohere_key,
            Provider.CEREBRAS: cerebras_key,
            Provider.GOOGLE:   google_key,
        }
        self._redis_url  = redis_url
        self._redis: Optional[aioredis.Redis] = None

    async def _get_redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = await aioredis.from_url(self._redis_url, decode_responses=True)
        return self._redis

    def _quota_key(self, provider: str) -> str:
        cfg = QUOTA_LIMITS[provider]
        now = datetime.utcnow()
        if cfg["window"] == "monthly":
            return cfg["redis_key"].format(year_month=now.strftime("%Y-%m"))
        return cfg["redis_key"].format(date=now.strftime("%Y-%m-%d"))

    async def _get_usage(self, provider: str) -> int:
        redis = await self._get_redis()
        val   = await redis.get(self._quota_key(provider))
        return int(val) if val else 0

    async def _increment_usage(self, provider: str) -> None:
        redis = await self._get_redis()
        key   = self._quota_key(provider)
        cfg   = QUOTA_LIMITS[provider]
        pipe  = redis.pipeline()
        pipe.incr(key)
        pipe.expire(key, 32 * 86400 if cfg["window"] == "monthly" else 86400)
        await pipe.execute()

    async def has_quota(self, provider: str) -> bool:
        if not self.keys.get(provider):
            return False
        usage = await self._get_usage(provider)
        cfg   = QUOTA_LIMITS[provider]
        limit = cfg.get("monthly") or cfg.get("daily", 999999)
        return usage < limit

    async def get_quota_status(self) -> dict:
        status = {}
        for provider in Provider:
            usage = await self._get_usage(provider)
            cfg   = QUOTA_LIMITS[provider]
            limit = cfg.get("monthly") or cfg.get("daily", 999999)
            status[provider] = {
                "used":      usage,
                "limit":     limit,
                "remaining": max(0, limit - usage),
                "pct_used":  round(usage / limit * 100, 1) if limit else 0,
                "available": bool(self.keys.get(provider)) and usage < limit,
            }
        return status

    # ── Provider callers ──────────────────────────────────────────

    async def _call_cohere(self, messages: list[dict], **kwargs) -> str:
        """Cohere v2 chat API — command-r-plus-08-2024."""
        api_key = self.keys[Provider.COHERE]
        t0      = time.monotonic()

        # Convert messages: system → preamble, rest → messages array
        preamble = ""
        cohere_msgs = []
        for m in messages:
            if m["role"] == "system":
                preamble = m["content"]
            else:
                cohere_msgs.append({
                    "role":    "user" if m["role"] == "user" else "assistant",
                    "content": m["content"],
                })

        body: dict = {
            "model":       COHERE_CHAT_MODEL,
            "messages":    cohere_msgs,
            "max_tokens":  kwargs.get("max_tokens", 1024),
            "temperature": kwargs.get("temperature", 0.7),
        }
        if preamble:
            body["system"] = preamble

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.cohere.com/v2/chat",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()

        text = data["message"]["content"][0]["text"].strip()
        await self._increment_usage(Provider.COHERE)
        logger.info("Cohere response: %.0fms", (time.monotonic() - t0) * 1000)
        return text

    async def _call_cerebras(self, messages: list[dict], **kwargs) -> str:
        """Cerebras llama3.1-8b — fastest inference."""
        api_key = self.keys[Provider.CEREBRAS]
        t0      = time.monotonic()

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.cerebras.ai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model":       CEREBRAS_MODEL,
                    "messages":    messages,
                    "max_tokens":  kwargs.get("max_tokens", 1024),
                    "temperature": kwargs.get("temperature", 0.7),
                },
            )
            resp.raise_for_status()
            data = resp.json()

        text = data["choices"][0]["message"]["content"].strip()
        await self._increment_usage(Provider.CEREBRAS)
        logger.info("Cerebras response: %.0fms", (time.monotonic() - t0) * 1000)
        return text

    async def _call_google(self, prompt: str, **kwargs) -> str:
        """Google gemini-flash-lite-latest — free-tier fallback."""
        api_key = self.keys[Provider.GOOGLE]
        t0      = time.monotonic()

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{GOOGLE_MODEL}:generateContent?key={api_key}",
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "maxOutputTokens": kwargs.get("max_tokens", 1024),
                        "temperature":     kwargs.get("temperature", 0.7),
                    },
                },
            )
            resp.raise_for_status()
            data = resp.json()

        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        await self._increment_usage(Provider.GOOGLE)
        logger.info("Google response: %.0fms", (time.monotonic() - t0) * 1000)
        return text

    async def _call_cohere_embed(self, texts: list[str]) -> list[list[float]]:
        """Cohere v2 embed — 1024-dim vectors."""
        api_key        = self.keys[Provider.COHERE]
        all_embeddings = []

        for i in range(0, len(texts), 96):
            batch = texts[i:i+96]
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    "https://api.cohere.com/v2/embed",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={
                        "model":            COHERE_EMBED_MODEL,
                        "texts":            batch,
                        "input_type":       "search_document",
                        "embedding_types":  ["float"],
                        "truncate":         "END",
                    },
                )
                resp.raise_for_status()
                data = resp.json()
            await self._increment_usage(Provider.COHERE)
            all_embeddings.extend(data["embeddings"]["float"])

        return all_embeddings

    # ── Public interface ──────────────────────────────────────────

    async def complete(
        self,
        prompt:    str,
        task_type: str = TaskType.CHAT_QA,
        messages:  Optional[list[dict]] = None,
        **kwargs,
    ) -> tuple[str, str]:
        """Route to best available provider. Returns (text, provider_name)."""
        providers = TASK_ROUTING.get(task_type, [Provider.CEREBRAS, Provider.GOOGLE, Provider.COHERE])

        for provider in providers:
            if not await self.has_quota(provider):
                continue
            try:
                t0 = time.monotonic()

                if provider == Provider.COHERE:
                    msgs = messages or [{"role": "user", "content": prompt}]
                    text = await self._call_cohere(msgs, **kwargs)

                elif provider == Provider.CEREBRAS:
                    msgs = messages or [{"role": "user", "content": prompt}]
                    text = await self._call_cerebras(msgs, **kwargs)

                elif provider == Provider.GOOGLE:
                    if messages:
                        full = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in messages)
                        text = await self._call_google(full, **kwargs)
                    else:
                        text = await self._call_google(prompt, **kwargs)

                else:
                    continue

                logger.info("LLM[%s] task=%s latency=%dms", provider, task_type, int((time.monotonic()-t0)*1000))
                return text, provider

            except Exception as exc:
                logger.warning("Provider %s failed: %s — trying next", provider, exc)
                continue

        raise QuotaExhausted("All LLM providers are unavailable. Request queued for retry.")

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings — Cohere only, zero-vector fallback."""
        if await self.has_quota(Provider.COHERE) and self.keys.get(Provider.COHERE):
            try:
                return await self._call_cohere_embed(texts)
            except Exception as e:
                logger.warning("Cohere embed failed: %s", e)
        logger.warning("No embedding provider — returning zero vectors")
        return [[0.0] * 1024 for _ in texts]

    async def classify_sentiment(self, headlines: list[str]) -> list[dict]:
        """
        Batch sentiment classification.
        Cohere Classify was removed Sep 2025 — now uses Cerebras/Google
        with a structured prompt for efficiency (batch of 20 per call).
        """
        results = []
        batch_size = 20

        for i in range(0, len(headlines), batch_size):
            batch = headlines[i:i+batch_size]
            numbered = "\n".join(f"{j+1}. {h}" for j, h in enumerate(batch))
            prompt = (
                "Classify each headline's market sentiment as bullish, bearish, or neutral.\n"
                "Reply with ONLY a JSON array of objects with 'label' and 'confidence' (0.0-1.0).\n"
                f"Headlines:\n{numbered}\n\n"
                "JSON response:"
            )
            try:
                text, _ = await self.complete(
                    prompt    = prompt,
                    task_type = TaskType.SENTIMENT_BATCH,
                    max_tokens= 300,
                    temperature=0.1,
                )
                # Parse JSON response
                import json, re
                json_match = re.search(r'\[.*?\]', text, re.DOTALL)
                if json_match:
                    parsed = json.loads(json_match.group())
                    for item in parsed:
                        label = item.get("label", "neutral").lower()
                        if label not in ("bullish", "bearish", "neutral"):
                            label = "neutral"
                        results.append({"label": label, "confidence": float(item.get("confidence", 0.7))})
                else:
                    results.extend([{"label": "neutral", "confidence": 0.5}] * len(batch))
            except Exception as e:
                logger.warning("Sentiment batch failed: %s", e)
                results.extend([{"label": "neutral", "confidence": 0.5}] * len(batch))

        return results

    async def close(self):
        if self._redis:
            await self._redis.aclose()
