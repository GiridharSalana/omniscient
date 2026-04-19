'use client'

import useSWR from 'swr'
import { swrFetcher } from '@/lib/api'
import type { MacroSnapshot, SectorPerf, EarningsEvent, TechSignal, VolumeAnomaly } from '@/lib/types'
import { MacroPanel }     from '@/components/dashboard/MacroPanel'
import { SectorHeatMap }  from '@/components/dashboard/SectorHeatMap'
import { EarningsCalendar } from '@/components/dashboard/EarningsCalendar'
import { TechnicalSignals } from '@/components/dashboard/TechnicalSignals'
import { cn, formatPct, changeColor } from '@/lib/utils'
import { TrendingUp, TrendingDown, Volume2, AlertTriangle } from 'lucide-react'

function VolumeAnomalyTable() {
  const { data, isLoading } = useSWR<VolumeAnomaly[]>(
    '/api/v1/technical/volume-anomalies?min_ratio=1.5',
    swrFetcher,
    { refreshInterval: 300_000 }
  )

  return (
    <div className="card">
      <div className="section-header">
        <Volume2 size={12} style={{ color: '#818cf8' }} />
        <span className="section-title" style={{ color: '#a5b4fc' }}>Volume Anomalies</span>
        <span className="text-[9px] text-muted">≥ 1.5× normal volume</span>
        <span className="badge badge-brand text-[9px] ml-auto">{data?.length ?? 0}</span>
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-1">
          {[1,2,3].map(i => <div key={i} className="h-5 rounded skeleton" />)}
        </div>
      ) : !data?.length ? (
        <p className="text-center text-muted text-[10px] py-4">No unusual volume detected in watchlist</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="sym-table w-full">
          <thead>
            <tr>
              <th>Symbol</th>
              <th className="text-right">Price</th>
              <th className="text-right">Change</th>
              <th className="text-right">Volume</th>
              <th className="text-right">vs Avg</th>
            </tr>
          </thead>
          <tbody>
            {data.map(a => (
              <tr key={a.symbol}>
                <td>
                  <div className="flex items-center gap-1">
                    {a.direction === 'up'   && <TrendingUp size={9} className="text-bull" />}
                    {a.direction === 'down' && <TrendingDown size={9} className="text-bear" />}
                    <span className="font-semibold text-[11px] text-text-primary">{a.symbol}</span>
                  </div>
                  <div className="text-[9px] text-muted truncate max-w-[80px]">{a.name}</div>
                </td>
                <td className="text-right num text-[11px] text-text-primary">{a.price?.toFixed(2) ?? '—'}</td>
                <td className={cn('text-right num text-[11px]', changeColor(a.change_pct))}>
                  {a.change_pct != null ? formatPct(a.change_pct) : '—'}
                </td>
                <td className="text-right text-[10px] text-text-secondary num">
                  {a.volume > 1e6 ? `${(a.volume/1e6).toFixed(1)}M` : `${(a.volume/1e3).toFixed(0)}K`}
                </td>
                <td className="text-right">
                  <span className="badge badge-warn text-[9px]">{a.volume_ratio.toFixed(1)}×</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  )
}

export default function MacroPage() {
  const { data: macro } = useSWR<MacroSnapshot>('/api/v1/macro/snapshot', swrFetcher, { refreshInterval: 3_600_000 })

  return (
    <div className="p-3 space-y-3 animate-fade-in">

      {/* Page header */}
      <div className="grid items-center py-1" style={{ gridTemplateColumns: '1fr auto 1fr', borderBottom: '1px solid var(--border-default)' }}>
        <div />
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} style={{ color: 'var(--brand)' }} />
          <h1 className="text-sm font-bold text-text-primary uppercase tracking-wider">Market Intelligence</h1>
        </div>
        <div className="flex justify-end">
          {macro && (
            <span className={cn('badge text-[10px]',
              macro.regime_signal === 'risk-on'  ? 'badge-bull' :
              macro.regime_signal === 'risk-off' ? 'badge-bear' : 'badge-warn'
            )}>
              {macro.regime_signal.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Row 1: Macro + Sector */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <MacroPanel />
        <SectorHeatMap />
      </div>

      {/* Row 2: Technical + Earnings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TechnicalSignals />
        <EarningsCalendar />
      </div>

      {/* Row 3: Volume Anomalies */}
      <VolumeAnomalyTable />
    </div>
  )
}
