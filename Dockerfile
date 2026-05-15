# ─────────────────────────────────────────────────────────────────
# Stage 1 — Build Next.js frontend (standalone output)
# ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build

RUN apk add --no-cache curl

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ .
RUN npm run build

# ─────────────────────────────────────────────────────────────────
# Stage 2 — All-in-one runtime
#   python:3.12-slim (Debian bookworm) + PostgreSQL 15 + pgvector
#   + Redis 7 + Node.js 20 + supervisord
# ─────────────────────────────────────────────────────────────────
FROM python:3.12-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive

# ── System packages ──────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        gnupg \
        ca-certificates \
        lsb-release \
        supervisor \
        redis-server \
        gcc \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# ── PostgreSQL 15 + pgvector (PGDG repo) ────────────────────────
RUN curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg \
    && echo "deb http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        postgresql-15 \
        postgresql-15-pgvector \
    && rm -rf /var/lib/apt/lists/*

# ── Node.js 20 runtime (no dev tools needed — just node binary) ──
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── uv ───────────────────────────────────────────────────────────
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
ENV UV_SYSTEM_PYTHON=1 UV_NO_CACHE=1

# ── Python dependencies ──────────────────────────────────────────
COPY backend/requirements.txt  /tmp/backend-req.txt
COPY scheduler/requirements.txt /tmp/scheduler-req.txt
RUN uv pip install -r /tmp/backend-req.txt \
    && uv pip install -r /tmp/scheduler-req.txt

# ── Application code ─────────────────────────────────────────────
COPY backend/  /app/backend/
COPY scheduler/ /app/scheduler/

# ── Frontend standalone build ────────────────────────────────────
# next.config.js output: 'standalone' produces a self-contained
# server.js at .next/standalone/ — copy it to /app/frontend/
COPY --from=frontend-builder /build/.next/standalone/    /app/frontend/
COPY --from=frontend-builder /build/.next/static         /app/frontend/.next/static
COPY --from=frontend-builder /build/public               /app/frontend/public

# ── PostgreSQL data dir ownership ────────────────────────────────
RUN mkdir -p /var/lib/postgresql/data/pgdata \
    && chown -R postgres:postgres /var/lib/postgresql

# ── Supervisor config + entrypoint ───────────────────────────────
RUN mkdir -p /var/log/supervisor
COPY supervisord.conf       /etc/supervisor/conf.d/supervisord.conf
COPY docker-entrypoint.sh   /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# frontend (3000) and backend API (8000)
EXPOSE 3000 8000

ENTRYPOINT ["/docker-entrypoint.sh"]
