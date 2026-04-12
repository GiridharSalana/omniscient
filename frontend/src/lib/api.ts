// API client — all requests go through Next.js rewrites to backend
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const TOKEN_KEY = 'omniscient_token'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

async function fetcher<T>(path: string, init?: RequestInit): Promise<T> {
  const url   = `${API_BASE}${path}`
  const token = getToken()
  const res   = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    const err = await res.text().catch(() => 'Unknown error')
    throw new Error(`API ${res.status}: ${err}`)
  }
  return res.json() as Promise<T>
}

// ── Market ────────────────────────────────────────────────────────
export const api = {
  market: {
    snapshot:         () => fetcher('/api/v1/market/snapshot'),
    quotes:           (symbols: string) => fetcher(`/api/v1/market/quotes?symbols=${symbols}`),
    history:          (symbol: string, period = '1y') => fetcher(`/api/v1/market/history/${symbol}?period=${period}`),
    indices:          () => fetcher('/api/v1/market/indices'),
    regime:           () => fetcher('/api/v1/market/regime'),
    watchlist:        () => fetcher('/api/v1/market/watchlist'),
    economicCalendar: (days = 7) => fetcher(`/api/v1/market/economic-calendar?days_ahead=${days}`),
  },
  news: {
    list:             (params?: Record<string, string|number>) => {
      const qs = new URLSearchParams(params as Record<string, string>).toString()
      return fetcher(`/api/v1/news/?${qs}`)
    },
    distribution:     (hours = 24) => fetcher(`/api/v1/news/impact-distribution?hours_back=${hours}`),
    search:           (query: string) => fetcher('/api/v1/news/search', {
      method: 'POST', body: JSON.stringify({ query, limit: 10 }),
    }),
    ingest:           () => fetcher('/api/v1/news/ingest', { method: 'POST' }),
  },
  momentum: {
    scan:             (params?: { region?: string; asset_class?: string; top_n?: number }) => {
      const qs = new URLSearchParams(params as Record<string, string>).toString()
      return fetcher(`/api/v1/momentum/scan?${qs}`)
    },
    symbol:           (sym: string) => fetcher(`/api/v1/momentum/symbol/${sym}`),
    recalculate:      () => fetcher('/api/v1/momentum/recalculate', { method: 'POST' }),
  },
  chat: {
    message:          (body: { message: string; history: unknown[]; use_rag: boolean }) =>
      fetcher('/api/v1/chat/message', { method: 'POST', body: JSON.stringify(body) }),
    suggestions:      () => fetcher('/api/v1/chat/suggestions'),
  },
  journal: {
    list:             (params?: Record<string, string|number>) => {
      const qs = new URLSearchParams(params as Record<string, string>).toString()
      return fetcher(`/api/v1/journal/?${qs}`)
    },
    create:           (body: unknown) => fetcher('/api/v1/journal/', { method: 'POST', body: JSON.stringify(body) }),
    update:           (id: number, body: unknown) => fetcher(`/api/v1/journal/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    stats:            () => fetcher('/api/v1/journal/stats/summary'),
    patterns:         () => fetcher('/api/v1/journal/patterns'),
  },
  briefing: {
    latest:           () => fetcher('/api/v1/briefing/latest'),
    history:          () => fetcher('/api/v1/briefing/history'),
    generate:         () => fetcher('/api/v1/briefing/generate', { method: 'POST' }),
  },
  macro: {
    snapshot:         () => fetcher('/api/v1/macro/snapshot'),
    sectorPerf:       () => fetcher('/api/v1/macro/sector-performance'),
    earningsCalendar: (days = 14) => fetcher(`/api/v1/macro/earnings-calendar?days_ahead=${days}`),
  },
  technical: {
    signals:          () => fetcher('/api/v1/technical/signals'),
    volumeAnomalies:  (min = 2.0) => fetcher(`/api/v1/technical/volume-anomalies?min_ratio=${min}`),
    symbol:           (sym: string) => fetcher(`/api/v1/technical/signal/${sym}`),
  },
  auth: {
    me:               () => fetcher('/api/v1/auth/me'),
  },
  users: {
    preferences:      () => fetcher('/api/v1/users/preferences'),
    updatePrefs:      (body: unknown) => fetcher('/api/v1/users/preferences', { method: 'PUT', body: JSON.stringify(body) }),
    watchlist:        () => fetcher('/api/v1/users/watchlist'),
  },
  stock: {
    search:           (q: string) => fetcher(`/api/v1/stock/search?q=${encodeURIComponent(q)}`),
    profile:          (sym: string) => fetcher(`/api/v1/stock/${sym}/profile`),
    history:          (sym: string, period = '1y', interval = '1d') => fetcher(`/api/v1/stock/${sym}/history?period=${period}&interval=${interval}`),
    news:             (sym: string, days = 30) => fetcher(`/api/v1/stock/${sym}/news?days=${days}`),
    technical:        (sym: string) => fetcher(`/api/v1/stock/${sym}/technical`),
    predict:          (sym: string, days = 30) => fetcher(`/api/v1/stock/${sym}/predict?days=${days}`),
  },
  screener: {
    presets:      () => fetcher('/api/v1/screener/presets'),
    run:          (preset: string, region?: string) =>
      fetcher(`/api/v1/screener/run?preset=${preset}${region ? `&region=${region}` : ''}`),
    seedUniverse: (region?: string) =>
      fetcher(`/api/v1/screener/seed-universe${region ? `?region=${region}` : ''}`, { method: 'POST' }),
  },
  india: {
    pcr:            () => fetcher('/api/v1/india/pcr'),
    fiiDii:         () => fetcher('/api/v1/india/fii-dii'),
    vixHistory:     (days = 30) => fetcher(`/api/v1/india/vix-history?days=${days}`),
    expiryCalendar: () => fetcher('/api/v1/india/expiry-calendar'),
  },
  portfolio: {
    get:           () => fetcher('/api/v1/portfolio/'),
    migrate:       () => fetcher('/api/v1/portfolio/migrate', { method: 'POST' }),
    addHolding:    (body: unknown) => fetcher('/api/v1/portfolio/holdings', { method: 'POST', body: JSON.stringify(body) }),
    updateHolding: (id: number, body: unknown) => fetcher(`/api/v1/portfolio/holdings/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteHolding: (id: number) => fetcher(`/api/v1/portfolio/holdings/${id}`, { method: 'DELETE' }),
  },
  alerts: {
    list:     (activeOnly = true) => fetcher(`/api/v1/alerts/?active_only=${activeOnly}`),
    create:   (body: unknown) => fetcher('/api/v1/alerts/', { method: 'POST', body: JSON.stringify(body) }),
    delete:   (id: number) => fetcher(`/api/v1/alerts/${id}`, { method: 'DELETE' }),
    triggered: (limit = 20) => fetcher(`/api/v1/alerts/triggered?limit=${limit}`),
    check:    () => fetcher('/api/v1/alerts/check', { method: 'POST' }),
  },
  init: {
    migrateV2:        () => fetcher('/api/v1/init/migrate-v2', { method: 'POST' }),
  },
  health:             () => fetcher('/health'),
}

// SWR fetcher — attaches auth token automatically
export const swrFetcher = (url: string) => {
  const token = getToken()
  return fetch(`${API_BASE}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).then(r => r.json())
}
