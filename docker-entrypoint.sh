#!/bin/bash
set -e

POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-omniscient_secret}"
PGDATA="/var/lib/postgresql/data/pgdata"

# Build and export connection URLs for backend and scheduler to inherit
export DATABASE_URL="postgresql+asyncpg://omniscient:${POSTGRES_PASSWORD}@localhost:5432/omniscient"
export SYNC_DATABASE_URL="postgresql://omniscient:${POSTGRES_PASSWORD}@localhost:5432/omniscient"
export REDIS_URL="redis://localhost:6379/0"
export BACKEND_URL="http://localhost:8000"

# ─────────────────────────────────────────────────────────────────
# PostgreSQL initialisation (only on first start)
# ─────────────────────────────────────────────────────────────────
if [ ! -f "${PGDATA}/PG_VERSION" ]; then
    echo "[entrypoint] Initializing PostgreSQL data directory..."
    su -s /bin/bash postgres -c \
        "/usr/lib/postgresql/15/bin/initdb -D ${PGDATA} --encoding=UTF8 --locale=C"
fi

echo "[entrypoint] Starting PostgreSQL for bootstrap..."
su -s /bin/bash postgres -c \
    "/usr/lib/postgresql/15/bin/pg_ctl start -D ${PGDATA} -w -l /tmp/postgres-init.log"

echo "[entrypoint] Setting up role and database..."
# Create role (idempotent)
su -s /bin/bash postgres -c \
    "createuser --no-superuser --no-createrole --no-createdb omniscient 2>/dev/null || true"
# Always sync password so POSTGRES_PASSWORD env var is respected
su -s /bin/bash postgres -c \
    "psql -U postgres -c \"ALTER USER omniscient WITH PASSWORD '${POSTGRES_PASSWORD}';\""
# Create database (idempotent)
su -s /bin/bash postgres -c \
    "createdb -O omniscient omniscient 2>/dev/null || true"
# Run schema (CREATE TABLE/EXTENSION IF NOT EXISTS — safe to re-run)
su -s /bin/bash postgres -c \
    "psql -U postgres -d omniscient -f /app/backend/sql/init.sql"

echo "[entrypoint] Stopping bootstrap PostgreSQL..."
su -s /bin/bash postgres -c \
    "/usr/lib/postgresql/15/bin/pg_ctl stop -D ${PGDATA} -w"

echo "[entrypoint] Handing off to supervisord..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
