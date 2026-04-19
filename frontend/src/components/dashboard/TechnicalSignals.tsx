'use client'

import useSWR from 'swr'
import { swrFetcher } from '@/lib/api'
import type { TechSignal } from '@/lib/types'
import { cn } from '@/lib/utils'

// ── RSI Gauge ──────────────────────────────────────────────────────
function RsiBar({ rsi }: { rsi: number | null }) {
  if (rsi === null) return <span className="text-muted text-[10px]">—</span>
  const pct = Math.min(100, Math.max(0, rsi))
  const color = rsi <= 30 ? '#00d68f' : rsi >= 70 ? '#ff4d6d' : '#fbbf24'
  const label = rsi <= 30 ? 'OS' : rsi >= 70 ? 'OB' : ''
  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-raised)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] num font-semibold w-7 text-right" style={{ color }}>{rsi.toFixed(0)}</span>
      {label && <span className="text-[8px] font-bold" style={{ color }}>{label}</span>}
    </div>
  )
}

// ── 52-week range bar ──────────────────────────────────────────────
function RangeBar({ pctFromLow }: { pctFromLow: number | null }) {
  if (pctFromLow === null) return <span className="text-muted text-[10px]">—</span>
  // pctFromLow = % above 52-week low; cap at 200%
  const pos = Math.min(100, Math.max(0, (pctFromLow / 200) * 100))
  const color = pos >= 80 ? '#00d68f' : pos <= 20 ? '#ff4d6d' : '#fbbf24'
  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-raised)' }}>
        <div className="h-full rounded-full" style={{ width: `${pos}%`, background: color }} />
      </div>
      <span className="text-[9px] text-muted num">+{pctFromLow.toFixed(0)}%</span>
    </div>
  )
}

// ── Overall signal badge ───────────────────────────────────────────
function OverallBadge({ signal }: { signal: string }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    strong_buy:  { cls: 'badge-bull',    label: '▲▲ STRONG BUY' },
    buy:         { cls: 'badge-bull',    label: '▲ BUY' },
    hold:        { cls: 'badge-neutral', label: '◆ HOLD' },
    sell:        { cls: 'badge-bear',    label: '▼ SELL' },
    strong_sell: { cls: 'badge-bear',    label: '▼▼ STRONG SELL' },
  }
  const c = cfg[signal] ?? { cls: 'badge-neutral', label: signal }
  return <span className={cn('badge text-[8px]', c.cls)}>{c.label}</span>
}

// ── MA status icons ────────────────────────────────────────────────
function MaStatus({ signal, cross }: { signal: string; cross: string }) {
  const trendColor = signal === 'bullish' ? 'text-bull' : signal === 'bearish' ? 'text-bear' : 'text-muted'
  const trendIcon  = signal === 'bullish' ? '↑' : signal === 'bearish' ? '↓' : '→'
  const crossLabel = cross === 'golden_cross' ? '✦GC' : cross === 'death_cross' ? '✦DC' : ''
  const crossColor = cross === 'golden_cross' ? 'text-bull' : 'text-bear'
  return (
    <div className="flex items-center gap-1">
      <span className={cn('text-[11px] font-bold', trendColor)}>{trendIcon}</span>
      {crossLabel && <span className={cn('text-[8px] font-bold', crossColor)}>{crossLabel}</span>}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────
export function TechnicalSignals() {
  const { data, isLoading } = useSWR<TechSignal[]>('/api/v1/technical/signals', swrFetcher, {
    refreshInterval: 300_000,
  })

  if (isLoading) {
    return (
      <div className="card animate-pulse space-y-2">
        <div className="h-2.5 w-32 rounded mx-auto skeleton" />
        {[1,2,3,4].map(i => <div key={i} className="h-5 rounded skeleton" />)}
      </div>
    )
  }

  if (!data?.length) {
    return (
      <div className="card">
        <div className="section-header">
          <span className="section-title">Technical Signals</span>
        </div>
        <p className="text-center text-muted text-[10px] py-4">No price data yet — recalculate momentum first</p>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="section-header">
        <span className="text-sm">📈</span>
        <span className="section-title" style={{ color: '#a5b4fc' }}>Technical Signals</span>
        <span className="text-[9px] text-muted">RSI · MA · Range · Signal</span>
      </div>

      <div className="overflow-x-auto">
      <table className="w-full sym-table min-w-[420px]">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>RSI(14)</th>
            <th>MA Trend</th>
            <th>52W Range</th>
            <th className="text-right">Signal</th>
          </tr>
        </thead>
        <tbody>
          {data.map(t => (
            <tr key={t.symbol}>
              <td>
                <div className="font-semibold text-[11px] text-text-primary leading-none">{t.symbol}</div>
                <div className="text-[9px] text-muted truncate max-w-[70px]">{t.name}</div>
              </td>
              <td className="w-28">
                <RsiBar rsi={t.rsi_14} />
              </td>
              <td>
                <MaStatus signal={t.trend_signal} cross={t.ma_cross} />
              </td>
              <td className="w-24">
                <RangeBar pctFromLow={t.pct_from_low} />
              </td>
              <td className="text-right">
                <OverallBadge signal={t.overall} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {/* Volume anomalies summary */}
      <VolumeAnomalyRow data={data} />
    </div>
  )
}

function VolumeAnomalyRow({ data }: { data: TechSignal[] }) {
  const highVol = data.filter(t => t.volume_signal === 'high')
  if (!highVol.length) return null
  return (
    <div className="mt-2 pt-1.5" style={{ borderTop: '1px solid var(--border-default)' }}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[9px] text-muted">⚡ High Volume:</span>
        {highVol.map(t => (
          <span key={t.symbol} className="badge badge-warn text-[8px]">
            {t.symbol} {t.volume_ratio?.toFixed(1)}x
          </span>
        ))}
      </div>
    </div>
  )
}
