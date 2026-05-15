FROM node:20-alpine AS base

WORKDIR /app

RUN apk add --no-cache curl

COPY package*.json ./

# ── Development stage ──────────────────────────────────────────
FROM base AS development

RUN npm install

COPY . .

EXPOSE 12345

CMD ["npm", "run", "dev"]

# ── Builder stage ──────────────────────────────────────────────
FROM base AS builder

RUN npm ci

COPY . .

RUN npm run build

# ── Production stage ───────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache curl && \
    addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 12345

ENV PORT=12345

CMD ["node", "server.js"]
