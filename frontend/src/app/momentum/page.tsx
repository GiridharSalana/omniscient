'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { swrFetcher, api } from '@/lib/api'
import type { MomentumScanResult, MomentumScore } from '@/lib/types'
import { cn, formatMomentum, changeColor, momentumRegimeBg, formatRelativeTime } from '@/lib/utils'
import { TrendingUp, TrendingDown, RefreshCw, Filter } from 'lucide-react'
import { Loader } from '@/components/shared/Loader'

const REGIONS     = ['All', 'americas', 'emea', 'asia', 'global']
const ASSET_TYPES = ['All', 'equity', 'commodity', 'fx', 'bond', 'volatility']
const TOP_N_OPTS  = [5, 10, 15, 20, 25]

export default function MomentumPage() {
  const [region,     setRegion]     = useState('All')
  const [assetClass, setAssetClass] = useState('All')
  const [topN,       setTopN]       = useState(10)
  const [recalcLoading, setRecalcLoading] = useState(false)

  const qs = new URLSearchParams({
    ...(region !== 'All'     ? { region }      : {}),
    ...(assetClass !== 'All' ? { asset_class: assetClass } : {}),
    top_n: String(topN),
  }).toString()

  const { data, isLoading, mutate } = useSWR<MomentumScanResult>(
    `/api/v1/momentum/scan?${qs}`, swrFetcher, { refreshInterval: 1_800_000 }
  )

  const recalculate = async () => {
    setRecalcLoading(true)
    try { await api.momentum.recalculate(); await mutate() }
    catch (e) { console.error(e) }
    finally { setRecalcLoading(false) }
  }

  if (isLoading) return <Loader message="Loading momentum data..." />

  return (
    <div className="p-3 space-y-3 animate-fade-in min-h-[calc(100vh-52px)]">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="grid items-center" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
        <div />
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-bull" />
          <h1 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Momentum Matrix</h1>
          {data?.updated_at && (
            <span className="text-[11px] text-muted">· {formatRelativeTime(data.updated_at)}</span>
          )}
        </div>
        <div className="flex justify-end">
          <button onClick={recalculate} disabled={recalcLoading} className="btn btn-ghost gap-1.5">
            <RefreshCw size={12} className={recalcLoading ? 'animate-spin' : ''} />
            Recalculate
          </button>
        </div>
      </div>

      {/* ── Filters — equal 5-column grid ───────────────────── */}
      <div className="card">
        <div className="flex items-center gap-3 flex-wrap justify-center">
          <div className="flex items-center gap-1.5">
            <Filter size={11} className="text-muted" />
            <span className="text-[11px] text-muted">Filters:</span>
          </div>

          <FilterGroup label="Region" value={region} options={REGIONS} onChange={setRegion} />
          <FilterGroup label="Asset" value={assetClass} options={ASSET_TYPES} onChange={setAssetClass} />

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted">Top N:</span>
            <div className="flex gap-1">
              {TOP_N_OPTS.map(n => (
                <button
                  key={n}
                  onClick={() => setTopN(n)}
                  className={cn(
                    'btn text-[10px] px-2 py-0.5',
                    topN === n ? 'btn-primary' : 'btn-ghost'
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main: Leaders | Laggards (perfectly mirrored) ───── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">

        {/* Leaders */}
        <div className="card">
          <div className="section-header">
            <TrendingUp size={14} className="text-bull" />
            <span className="section-title text-bull">Momentum Leaders</span>
            <span className="badge border border-bull/30 bg-bull/10 text-bull text-[9px] px-1.5 py-0.5">
              {data?.leaders.length ?? 0}
            </span>
          </div>
          <FullMomentumTable rows={data?.leaders ?? []} side="leaders" />
        </div>

        {/* Laggards — identical structure, mirrored */}
        <div className="card">
          <div className="section-header">
            <TrendingDown size={14} className="text-bear" />
            <span className="section-title text-bear">Momentum Laggards</span>
            <span className="badge border border-bear/30 bg-bear/10 text-bear text-[9px] px-1.5 py-0.5">
              {data?.laggards.length ?? 0}
            </span>
          </div>
          <FullMomentumTable rows={data?.laggards ?? []} side="laggards" />
        </div>
      </div>

      {/* ── Regime guide + Score methodology ────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {/* Regime legend */}
        <div className="card">
          <div className="section-header">
            <span className="section-title">Regime Guide</span>
          </div>
          <div className="space-y-1">
            {[
              { r: 'surging',  desc: 'All timeframes aligned up — strong trend continuation candidate', action: 'BUY DIP', color: '#00d68f' },
              { r: 'strong',   desc: 'Short + medium-term bullish with positive volume', action: 'ADD',     color: '#86efac' },
              { r: 'neutral',  desc: 'Mixed signals — range-bound or transitioning', action: 'WATCH',   color: '#fbbf24' },
              { r: 'weak',     desc: 'Short-term selling pressure, medium still positive', action: 'REDUCE',  color: '#f97316' },
              { r: 'crashing', desc: 'All timeframes negative — avoid or short', action: 'AVOID',   color: '#ff4d6d' },
            ].map(({ r, desc, action, color }) => (
              <div key={r} className="flex items-start gap-2 py-1 last:border-0" style={{ borderBottom: '1px solid var(--border-dim)' }}>
                <span className="text-[9px] font-bold uppercase w-16 flex-shrink-0 mt-px" style={{ color }}>{r}</span>
                <span className="text-[10px] text-text-secondary flex-1 leading-snug">{desc}</span>
                <span className="text-[9px] font-semibold px-1.5 py-px rounded flex-shrink-0" style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>{action}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Score methodology */}
        <div className="card">
          <div className="section-header">
            <span className="section-title">Score Methodology</span>
          </div>
          <div className="space-y-1.5 text-[10px] text-text-secondary leading-relaxed">
            <p>The <span className="text-brand font-semibold">Composite Score</span> is a weighted multi-factor momentum signal:</p>
            <div className="space-y-1">
              {[
                { factor: '1D Return', weight: '25%', why: 'Fresh momentum, most recent signal' },
                { factor: '1W Return', weight: '25%', why: 'Short-term trend confirmation' },
                { factor: '1M Return', weight: '25%', why: 'Medium-term trend strength' },
                { factor: '3M Return', weight: '15%', why: 'Longer trend context' },
                { factor: 'Volume Ratio', weight: '10%', why: 'Conviction — is money flowing in?' },
              ].map(({ factor, weight, why }) => (
                <div key={factor} className="flex items-center gap-2">
                  <span className="text-brand font-semibold w-24 flex-shrink-0">{factor}</span>
                  <span className="w-8 text-warn flex-shrink-0">{weight}</span>
                  <span className="text-muted">{why}</span>
                </div>
              ))}
            </div>
            <p className="text-muted pt-1" style={{ borderTop: '1px solid var(--border-dim)' }}>
              Percentile rank shows where each stock sits vs all tracked securities.
              Leaders are non-overlapping with laggards.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function FilterGroup({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-muted">{label}:</span>
      <div className="flex gap-1 flex-wrap">
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={cn(
              'btn text-[10px] px-2 py-0.5 capitalize',
              value === opt ? 'btn-primary' : 'btn-ghost'
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

function FullMomentumTable({ rows, side }: { rows: MomentumScore[]; side: 'leaders' | 'laggards' }) {
  if (!rows.length) {
    return (
      <div className="text-center py-3">
        <p className="text-muted text-xs">No momentum data.</p>
        <p className="text-muted text-[10px] mt-0.5">Click Recalculate to compute scores.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
    <table className="sym-table w-full min-w-[480px]">
      <thead>
        <tr>
          <th>#</th>
          <th>Symbol</th>
          <th className="text-right">1D</th>
          <th className="text-right">1W</th>
          <th className="text-right">1M</th>
          <th className="text-right">3M</th>
          <th className="text-right">Vol</th>
          <th className="text-right">Score</th>
          <th className="text-right">Rank</th>
          <th className="text-right">Regime</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.symbol}>
            <td className="text-muted num text-[11px]">{i + 1}</td>
            <td>
              <div className="font-medium text-text-primary text-[11px] leading-none">{row.symbol}</div>
              {row.name && <div className="text-[9px] text-muted truncate max-w-[80px] leading-none">{row.name}</div>}
            </td>
            <td className={cn('num text-[11px] font-medium', changeColor(row.price_momentum_1d))}>
              {formatMomentum(row.price_momentum_1d)}
            </td>
            <td className={cn('num text-[11px]', changeColor(row.price_momentum_1w))}>
              {formatMomentum(row.price_momentum_1w)}
            </td>
            <td className={cn('num text-[11px]', changeColor(row.price_momentum_1m))}>
              {formatMomentum(row.price_momentum_1m)}
            </td>
            <td className={cn('num text-[11px]', changeColor(row.price_momentum_3m))}>
              {formatMomentum(row.price_momentum_3m)}
            </td>
            <td className="num text-[10px] text-muted">
              {row.volume_momentum?.toFixed(2) ?? '—'}x
            </td>
            <td className={cn('num text-[11px] font-semibold', changeColor(row.composite_score))}>
              {row.composite_score?.toFixed(1) ?? '—'}
            </td>
            <td className="num text-[10px] text-muted">
              {row.percentile_rank?.toFixed(0) ?? '—'}%
            </td>
            <td>
              {row.regime && (
                <span className={cn('badge text-[9px]', momentumRegimeBg(row.regime))}>
                  {row.regime}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  )
}
