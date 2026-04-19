'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { swrFetcher, api } from '@/lib/api'
import type { NewsItem } from '@/lib/types'
import { cn, sentimentBg, sentimentColor, formatRelativeTime, impactColor } from '@/lib/utils'
import { Newspaper, Search, ExternalLink, RefreshCw } from 'lucide-react'
import { Loader } from '@/components/shared/Loader'

const SENTIMENT_OPTS = ['All', 'bullish', 'bearish', 'neutral'] as const
const HOURS_OPTS     = [6, 12, 24, 48, 72, 168]

export default function NewsPage() {
  const [sentiment, setSentiment] = useState<string>('All')
  const [hours,     setHours]     = useState(24)
  const [query,     setQuery]     = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<NewsItem[] | null>(null)

  const qs = new URLSearchParams({
    limit:      '100',
    hours_back: String(hours),
    ...(sentiment !== 'All' ? { sentiment } : {}),
  }).toString()

  const { data, isLoading, mutate } = useSWR<NewsItem[]>(`/api/v1/news/?${qs}`, swrFetcher, {
    refreshInterval: 600_000,
  })

  const doSearch = async () => {
    if (!query.trim()) { setSearchResults(null); return }
    setSearching(true)
    try {
      const results = await api.news.search(query) as NewsItem[]
      setSearchResults(results)
    } finally {
      setSearching(false)
    }
  }

  const displayed = searchResults ?? data ?? []

  if (isLoading) return <Loader message="Loading news feed..." />

  return (
    <div className="p-3 space-y-3 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="grid items-center" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
        <div />
        <div className="flex items-center gap-2">
          <Newspaper size={15} className="text-info" />
          <h1 className="text-sm font-semibold text-text-primary uppercase tracking-wider">News Intelligence</h1>
          <span className="text-[11px] text-muted">· {displayed.length} items</span>
        </div>
        <div className="flex justify-end">
          <button onClick={() => { setSearchResults(null); mutate() }}
            className="btn btn-ghost gap-1">
            <RefreshCw size={11} />Refresh
          </button>
        </div>
      </div>

      {/* ── Search + Filters — centered ─────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-3 flex-wrap justify-center">
          {/* Vector search */}
          <div className="flex items-center gap-2 flex-1 min-w-48 max-w-sm">
            <input
              className="input text-[12px] py-1.5"
              placeholder="Search news semantically..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
            />
            <button onClick={doSearch} disabled={searching} className="btn btn-primary py-1.5">
              <Search size={12} />
            </button>
            {searchResults && (
              <button onClick={() => setSearchResults(null)} className="btn btn-ghost text-[11px]">
                Clear
              </button>
            )}
          </div>

          {/* Sentiment filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted">Sentiment:</span>
            {SENTIMENT_OPTS.map(s => (
              <button key={s} onClick={() => setSentiment(s)}
                className={cn('btn text-[10px] px-2 py-0.5 capitalize',
                  sentiment === s ? 'btn-primary' : 'btn-ghost')}>
                {s}
              </button>
            ))}
          </div>

          {/* Time window */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted">Window:</span>
            {HOURS_OPTS.map(h => (
              <button key={h} onClick={() => setHours(h)}
                className={cn('btn text-[10px] px-2 py-0.5', hours === h ? 'btn-primary' : 'btn-ghost')}>
                {h >= 24 ? `${h/24}d` : `${h}h`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── News grid — 3 equal columns for density ──────────── */}
      {displayed.length === 0 ? (
        <div className="text-center py-6 text-muted text-xs">No news matching filters</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
          {displayed.map((item, idx) => {
            const total = displayed.length
            const isOrphan = total % 3 === 1 && idx === total - 1
            return (
              <div key={item.id} className={isOrphan ? 'lg:col-start-2' : ''}>
                <NewsCard item={item} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function NewsCard({ item }: { item: NewsItem }) {
  const s = item.sentiment as any
  return (
    <div className={cn('rounded border px-2 py-1.5 space-y-1', sentimentBg(s))}>
      {/* Headline */}
      <div className="flex items-start gap-1">
        <div className="flex-1 min-w-0">
          {item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer"
               className="text-[11px] text-text-primary leading-snug hover:text-blue-400 transition-colors line-clamp-2 flex items-start gap-1">
              <span className="flex-1">{item.headline}</span>
              <ExternalLink size={9} className="flex-shrink-0 mt-0.5 text-muted" />
            </a>
          ) : (
            <p className="text-[11px] text-text-primary leading-snug line-clamp-2">{item.headline}</p>
          )}
        </div>
        {item.sentiment && (
          <span className={cn('badge text-[8px] flex-shrink-0 px-1.5 py-px',
            s === 'bullish' ? 'badge-bull' :
            s === 'bearish' ? 'badge-bear' : 'badge-warn'
          )}>
            {s === 'bullish' ? '▲' : s === 'bearish' ? '▼' : '◆'}
          </span>
        )}
      </div>

      {/* Footer — compact single row */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-[9px] text-muted truncate">{item.source} · {formatRelativeTime(item.published_at)}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {item.affected_symbols.slice(0, 2).map(sym => (
            <span key={sym} className="badge border border-[#1c2030] text-[8px] text-muted px-1 py-px">{sym}</span>
          ))}
          {item.impact_score != null && (
            <span className={cn('num text-[9px]', impactColor(item.impact_score))}>{item.impact_score}</span>
          )}
        </div>
      </div>
    </div>
  )
}
