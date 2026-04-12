'use client'

import useSWR from 'swr'
import { swrFetcher } from '@/lib/api'
import { cn, formatPrice, formatPct, changeColor } from '@/lib/utils'
import type { WatchlistItem, TechSignal } from '@/lib/types'
import { Star, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react'
import Link from 'next/link'

// ── Sparkline component ───────────────────────────────────────────
function Sparkline({ symbol, changePct }: { symbol: string; changePct: number | null }) {
  const { data } = useSWR<{ close: number; date?: string }[]>(
    `/api/v1/market/history/${symbol}?period=5d&interval=1d`,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 },
  )

  const isUp = (changePct ?? 0) >= 0
  const color = isUp ? '#00d68f' : '#ff4d6d'

  if (!data || data.length < 2) {
    // Loading placeholder
    return (
      <div className="w-16 h-8 flex items-end gap-px px-0.5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex-1 rounded-sm animate-pulse"
            style={{ height: `${30 + Math.random() * 40}%`, background: '#1a2235' }} />
        ))}
      </div>
    )
  }

  const closes = data.map(d => d.close).filter(Boolean)
  if (closes.length < 2) return null

  const min   = Math.min(...closes)
  const max   = Math.max(...closes)
  const range = max - min || 1
  const W = 64, H = 32

  const points = closes.map((c, i) => ({
    x: (i / (closes.length - 1)) * W,
    y: H - ((c - min) / range) * (H - 4) - 2,
  }))

  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')

  // Area fill path
  const area = `${d} L ${points[points.length - 1].x.toFixed(1)} ${H} L 0 ${H} Z`

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <defs>
        <linearGradient id={`sg-${symbol}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${symbol})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="2" fill={color}
      />
    </svg>
  )
}

// ── RSI mini badge ────────────────────────────────────────────────
function RsiMini({ rsi }: { rsi: number | null | undefined }) {
  if (!rsi) return <span className="text-muted text-[9px]">—</span>
  const color = rsi <= 30 ? '#00d68f' : rsi >= 70 ? '#ff4d6d' : '#fbbf24'
  const label = rsi <= 30 ? 'OS' : rsi >= 70 ? 'OB' : rsi.toFixed(0)
  return (
    <span className="num text-[9px] font-bold px-1 py-0.5 rounded"
      style={{ color, background: `${color}15` }}>
      {label}
    </span>
  )
}

// ── Signal badge ─────────────────────────────────────────────────
function SignalBadge({ signal }: { signal: string | undefined }) {
  if (!signal) return null
  const cfg: Record<string, { cls: string; label: string }> = {
    strong_buy:  { cls: 'badge-bull', label: '▲▲' },
    buy:         { cls: 'badge-bull', label: '▲'  },
    hold:        { cls: 'badge-neutral', label: '◆' },
    sell:        { cls: 'badge-bear', label: '▼'  },
    strong_sell: { cls: 'badge-bear', label: '▼▼' },
  }
  const c = cfg[signal] ?? { cls: 'badge-neutral', label: '?' }
  return <span className={cn('badge text-[8px] px-1', c.cls)}>{c.label}</span>
}

// ── Target badge ─────────────────────────────────────────────────
function TargetBadge({ price, target }: { price: number | null; target: number | null }) {
  if (!target || !price) return null
  const pct  = ((target - price) / price) * 100
  const up   = pct >= 0
  const color = up ? '#00d68f' : '#ff4d6d'
  return (
    <div className="text-right flex-shrink-0">
      <div className="text-[8px] text-muted">Target</div>
      <div className="num text-[9px] font-semibold" style={{ color }}>
        {up ? '+' : ''}{pct.toFixed(1)}%
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────
interface Props { items: WatchlistItem[] }

export function WatchlistPanel({ items }: Props) {
  const { data: techData } = useSWR<TechSignal[]>('/api/v1/technical/signals', swrFetcher, {
    refreshInterval: 300_000,
  })

  const techMap = new Map<string, TechSignal>()
  techData?.forEach(t => techMap.set(t.symbol, t))

  if (items.length === 0) {
    return (
      <div className="card">
        <div className="section-header">
          <Star size={12} className="text-warn" />
          <span className="section-title">Watchlist</span>
        </div>
        <div className="text-center py-6 text-muted text-xs">
          No watchlist items · Add stocks via settings
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="section-header">
        <Star size={12} className="text-warn" />
        <span className="section-title">Watchlist</span>
        <span className="text-[9px] text-muted">{items.length} symbols</span>
        <Link href="/screener" className="ml-auto text-[9px] text-brand hover:underline flex items-center gap-0.5">
          Screener <ChevronRight size={9} />
        </Link>
      </div>

      <div className="space-y-0.5">
        {items.map(item => {
          const tech = techMap.get(item.symbol)
          const isUp = (item.change_pct ?? 0) >= 0

          return (
            <Link
              key={item.symbol}
              href={`/stock/${item.symbol}`}
              className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-[#0f1f38] transition-colors group"
            >
              {/* Symbol + name */}
              <div className="w-24 flex-shrink-0">
                <div className="font-bold text-brand text-[11px] group-hover:underline leading-none">
                  {item.symbol}
                </div>
                {item.name && (
                  <div className="text-[8px] text-muted truncate max-w-[88px] leading-none mt-0.5">
                    {item.name}
                  </div>
                )}
              </div>

              {/* Sparkline */}
              <div className="flex-shrink-0">
                <Sparkline symbol={item.symbol} changePct={item.change_pct} />
              </div>

              {/* Price + change */}
              <div className="flex-1 min-w-0 text-right">
                <div className="num text-[11px] text-text-primary font-semibold leading-none">
                  {formatPrice(item.price)}
                </div>
                <div className={cn('num text-[10px] font-bold flex items-center justify-end gap-0.5 mt-0.5')}>
                  <span style={{ color: isUp ? '#00d68f' : '#ff4d6d' }}>
                    {isUp
                      ? <TrendingUp size={9} className="inline" />
                      : <TrendingDown size={9} className="inline" />}
                    {' '}{formatPct(item.change_pct)}
                  </span>
                </div>
              </div>

              {/* RSI */}
              <div className="flex-shrink-0 w-8 text-center">
                <RsiMini rsi={tech?.rsi_14} />
              </div>

              {/* Signal */}
              <div className="flex-shrink-0 w-7 text-center">
                <SignalBadge signal={tech?.overall} />
              </div>

              {/* Target */}
              <TargetBadge price={item.price} target={item.target_price} />

              {/* Arrow hint */}
              <ChevronRight size={10} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </Link>
          )
        })}
      </div>

      {/* Footer link to screener */}
      <div className="mt-2 pt-1.5 border-t border-[#1a2235] flex items-center justify-between">
        <span className="text-[8px] text-muted">Click any row to open full chart + analysis</span>
        <Link href="/screener"
          className="text-[9px] text-brand hover:underline flex items-center gap-0.5">
          Open Screener <ChevronRight size={9} />
        </Link>
      </div>
    </div>
  )
}
