"""
AI Chat Router with RAG (Retrieval-Augmented Generation)
Uses vector similarity search on news embeddings to provide context-aware answers.
Provider: Cerebras primary (speed), Google AI backup.
"""
from __future__ import annotations

import logging
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from llm_router import LLMRouter, TaskType
from models.schemas import ChatRequest, ChatResponse
from main import get_db, get_llm

logger = logging.getLogger(__name__)
router = APIRouter()

SYSTEM_PROMPT = """You are Omniscient, an expert market intelligence assistant for a professional solo trader.
You have access to real-time market data, news, and momentum analysis.
Provide concise, actionable insights. Format numbers clearly. 
Flag risks explicitly. Never give investment advice — provide analysis only.
When citing news, mention the source and date. Keep responses under 400 words unless asked for detail."""


@router.post("/message", response_model=ChatResponse)
async def chat_message(
    req: ChatRequest,
    db:  AsyncSession = Depends(get_db),
    llm: LLMRouter    = Depends(get_llm),
):
    """
    Send a message and get an AI response with optional RAG context.
    RAG searches news embeddings for relevant articles.
    """
    t0 = time.monotonic()

    rag_sources: list[dict] = []
    context_block = ""

    if req.use_rag and req.message:
        try:
            # Embed the query
            q_embeddings = await llm.embed([req.message])
            if q_embeddings and any(v != 0 for v in q_embeddings[0]):
                # Vector similarity search in PostgreSQL
                embedding_str = "[" + ",".join(str(v) for v in q_embeddings[0]) + "]"
                result = await db.execute(
                    text("""
                        SELECT id, headline, source, published_at, sentiment,
                               sentiment_score, summary, impact_score,
                               1 - (embedding <=> CAST(:embedding AS vector)) AS similarity
                        FROM news
                        WHERE embedding IS NOT NULL
                          AND published_at > NOW() - INTERVAL '7 days'
                        ORDER BY embedding <=> CAST(:embedding AS vector)
                        LIMIT 5
                    """),
                    {"embedding": embedding_str},
                )
                rows = result.fetchall()
                rag_sources = [dict(r._mapping) for r in rows]

                if rag_sources:
                    context_block = "\n\nRELEVANT RECENT NEWS:\n"
                    for src in rag_sources:
                        sentiment_str = f" [{src.get('sentiment', 'neutral').upper()}]" if src.get('sentiment') else ""
                        context_block += (
                            f"- {src['headline']}{sentiment_str} "
                            f"(Source: {src.get('source','?')}, "
                            f"{src.get('published_at','').strftime('%b %d') if hasattr(src.get('published_at'), 'strftime') else ''})\n"
                        )
                        if src.get('summary'):
                            context_block += f"  Summary: {src['summary']}\n"

        except Exception as e:
            logger.warning("RAG search failed: %s", e)
            rag_sources = []

    # Build messages for LLM
    messages = [{"role": "system", "content": SYSTEM_PROMPT + context_block}]
    for msg in req.history[-6:]:  # last 3 turns
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": req.message})

    try:
        answer, provider = await llm.complete(
            prompt    = req.message,
            task_type = TaskType.CHAT_QA,
            messages  = messages,
            max_tokens= 600,
            temperature=0.7,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AI unavailable: {e}")

    latency_ms = int((time.monotonic() - t0) * 1000)

    # Clean up sources for response
    clean_sources = [
        {
            "headline":    s.get("headline"),
            "source":      s.get("source"),
            "published_at": str(s.get("published_at", "")),
            "sentiment":   s.get("sentiment"),
            "similarity":  round(float(s.get("similarity", 0)), 3),
        }
        for s in rag_sources
    ]

    return ChatResponse(
        answer     = answer,
        provider   = provider,
        sources    = clean_sources,
        latency_ms = latency_ms,
    )


@router.get("/suggestions")
async def get_chat_suggestions():
    """Pre-built query suggestions for the chat interface."""
    return [
        "Why is tech underperforming today?",
        "What are the key risks for the week ahead?",
        "Show me the highest momentum opportunities right now",
        "How does the VIX spike affect portfolio positioning?",
        "Summarize the Fed's recent communications",
        "Which sectors benefit from rising yields?",
        "What's driving gold higher?",
        "Explain the yield curve inversion and its implications",
        "What are the key earnings this week?",
        "How is the dollar affecting emerging markets?",
    ]
