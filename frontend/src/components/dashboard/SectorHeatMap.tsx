'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { swrFetcher } from '@/lib/api'
import type { SectorPerf } from '@/lib/types'
import { cn } from '@/lib/utils'

const SECTOR_SHORT: Record<string, string> = {
  'Information Technology': 'Tech',
  'Health Care':            'Health',
  'Financials':             'Finance',
  'Consumer Discretionary': 'Cons.Disc',
  'Communication Services': 'Comms',
  'Industrials':            'Industrials',
  'Consumer Staples':       'Staples',
  'Energy':                 'Energy',
  'Utilities':              'Utilities',
  'Real Estate':            'Real Est.',
  'Materials':              'Materials',
}

function heatColor(pct: number | null): string {
  if (pct === null) return '#0f1f38'
  if (pct >= 2.0)  return 'rgba(0,214,143,0.35)'
  if (pct >= 1.0)  return 'rgba(0,214,143,0.20)'
  if (pct >= 0.3)  return 'rgba(0,214,143,0.10)'
  if (pct >= -0.3) return 'rgba(251,191,36,0.10)'
  if (pct >= -1.0) return 'rgba(255,77,109,0.10)'
  if (pct >= -2.0) return 'rgba(255,77,109,0.20)'
  return 'rgba(255,77,109,0.35)'
}

function textColor(pct: number | null): string {
  if (pct === null) return '#4b5d73'
  if (pct >= 0.3)  return '#00d68f'
  if (pct <= -0.3) return '#ff4d6d'
  return '#fbbf24'
}

function SectorTile({ s, view }: { s: SectorPerf; view: '1D' | '5D' | '1M' | 'YTD' }) {
  const val = view === '1D' ? s.d1 : view === '5D' ? s.d5 : view === '1M' ? s.d30 : s.ytd
  const bg  = heatColor(val)
  const tc  = textColor(val)
  const sign = val !== null && val >= 0 ? '+' : ''

  return (
    <div
      className="rounded flex flex-col items-center justify-center py-2 px-1 cursor-default transition-all hover:scale-105 hover:z-10"
      style={{ background: bg, minHeight: 52, border: '1px solid var(--border-default)' }}
      title={`${s.sector}: ${sign}${val?.toFixed(2) ?? '—'}%`}
    >
      <div className="text-[9px] text-text-secondary font-medium text-center leading-tight mb-0.5">
        {SECTOR_SHORT[s.sector] ?? s.sector}
      </div>
      <div className="text-[11px] font-bold num" style={{ color: tc }}>
        {val !== null ? `${sign}${val.toFixed(2)}%` : '—'}
      </div>
    </div>
  )
}

export function SectorHeatMap() {
  const { data, isLoading } = useSWR<SectorPerf[]>(
    '/api/v1/macro/sector-performance',
    swrFetcher,
    { refreshInterval: 3_600_000 }
  )

  const [view, setView] = useState<'1D' | '5D' | '1M' | 'YTD'>('1D')

  if (isLoading) {
    return (
      <div className="card animate-pulse">
        <div className="h-2.5 w-28 rounded mx-auto mb-3 skeleton" />
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="h-12 rounded" style={{ background: '#0f1f38' }} />
          ))}
        </div>
      </div>
    )
  }

  if (!data?.length) {
    return (
      <div className="card">
        <div className="section-header">
          <span className="section-title">Sector Rotation</span>
        </div>
        <p className="text-center text-muted text-[10px] py-4">
          Alpha Vantage sector data unavailable
        </p>
      </div>
    )
  }

  const sorted = [...data].sort((a, b) => {
    const va = (view === '1D' ? a.d1 : view === '5D' ? a.d5 : view === '1M' ? a.d30 : a.ytd) ?? -999
    const vb = (view === '1D' ? b.d1 : view === '5D' ? b.d5 : view === '1M' ? b.d30 : b.ytd) ?? -999
    return vb - va
  })

  return (
    <div className="card">
      <div className="section-header">
        <span className="text-sm">🔥</span>
        <span className="section-title" style={{ color: '#a5b4fc' }}>Sector Rotation</span>
        <div className="ml-auto flex gap-0.5">
          {(['1D', '5D', '1M', 'YTD'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn('btn text-[9px] px-1.5 py-px', view === v ? 'btn-primary' : 'btn-ghost')}
            >{v}</button>
          ))}
        </div>
      </div>

      {/* Leaders/Laggards summary */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted">Top:</span>
          {sorted.slice(0, 2).map(s => (
            <span key={s.sector} className="badge badge-bull text-[8px]">
              {SECTOR_SHORT[s.sector] ?? s.sector}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted">Lag:</span>
          {sorted.slice(-2).reverse().map(s => (
            <span key={s.sector} className="badge badge-bear text-[8px]">
              {SECTOR_SHORT[s.sector] ?? s.sector}
            </span>
          ))}
        </div>
      </div>

      {/* Heat map grid — 6 columns at full width */}
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-1">
        {sorted.map(s => <SectorTile key={s.sector} s={s} view={view} />)}
      </div>
    </div>
  )
}

