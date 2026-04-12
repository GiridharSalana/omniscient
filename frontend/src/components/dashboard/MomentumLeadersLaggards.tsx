'use client'

import { cn, formatPct, formatMomentum, changeColor, momentumRegimeBg, formatRelativeTime } from '@/lib/utils'
import type { MomentumScore } from '@/lib/types'
import { TrendingUp, TrendingDown } from 'lucide-react'
import Link from 'next/link'

interface Props {
  leaders:   MomentumScore[]
  laggards:  MomentumScore[]
  updatedAt?: string
}

export function MomentumLeadersLaggards({ leaders, laggards, updatedAt }: Props) {
  return (
    <div className="card">
      {/* Section header — centered */}
      <div className="section-header">
        <TrendingUp size={13} className="text-bull" />
        <span className="section-title">Momentum Scanner</span>
        {updatedAt && <span className="text-[10px] text-muted">Updated {formatRelativeTime(updatedAt)}</span>}
        <Link href="/momentum" className="ml-auto text-[11px] text-brand hover:text-blue-400 transition-colors">
          Full matrix →
        </Link>
      </div>

      {/* Two equal-width tables side by side */}
      <div className="grid grid-cols-2 gap-2">

        {/* Leaders — Green */}
        <div>
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingUp size={10} className="text-bull" />
            <span className="text-[9px] font-semibold text-bull uppercase tracking-wider">→ Leaders</span>
          </div>
          <MomentumTable rows={leaders.slice(0, 8)} side="leaders" />
        </div>

        {/* Laggards — Red (mirrored table structure) */}
        <div>
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingDown size={10} className="text-bear" />
            <span className="text-[9px] font-semibold text-bear uppercase tracking-wider">↘ Laggards</span>
          </div>
          <MomentumTable rows={laggards.slice(0, 8)} side="laggards" />
        </div>

      </div>
    </div>
  )
}

function MomentumTable({ rows, side }: { rows: MomentumScore[]; side: 'leaders' | 'laggards' }) {
  if (!rows.length) {
    return <div className="text-center text-muted text-xs py-4">No data yet</div>
  }

  return (
    <table className="sym-table w-full">
      <thead>
        <tr>
          <th className="text-left">#</th>
          <th className="text-left">Symbol</th>
          <th className="text-right">1D</th>
          <th className="text-right">1W</th>
          <th className="text-right">Score</th>
          <th className="text-right">Regime</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const rank = side === 'leaders' ? i + 1 : rows.length - i
          return (
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
              <td className={cn('num text-[11px] font-semibold', changeColor(row.composite_score))}>
                {row.composite_score?.toFixed(1) ?? '—'}
              </td>
              <td>
                {row.regime && (
                  <span className={cn('badge text-[9px]', momentumRegimeBg(row.regime))}>
                    {row.regime}
                  </span>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
