'use client'

import useSWR from 'swr'
import { swrFetcher } from '@/lib/api'
import type { EarningsEvent } from '@/lib/types'
import { cn } from '@/lib/utils'

function groupByDate(events: EarningsEvent[]) {
  const groups: Record<string, EarningsEvent[]> = {}
  for (const e of events) {
    if (!groups[e.report_date]) groups[e.report_date] = []
    groups[e.report_date].push(e)
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
}

function formatDate(d: string) {
  const date = new Date(d + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'TODAY'
  if (diff === 1) return 'TOMORROW'
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function SurpriseBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null
  const cls = pct >= 5 ? 'badge-bull' : pct <= -5 ? 'badge-bear' : 'badge-neutral'
  const sign = pct >= 0 ? '+' : ''
  return <span className={cn('badge text-[8px]', cls)}>{sign}{pct.toFixed(1)}%</span>
}

function TimeBadge({ time }: { time: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    BMO: { label: 'BMO', cls: 'badge-brand' },
    AMC: { label: 'AMC', cls: 'badge-warn' },
    TNS: { label: '?', cls: 'badge-neutral' },
  }
  const c = cfg[time] ?? cfg.TNS
  return <span className={cn('badge text-[8px]', c.cls)}>{c.label}</span>
}

export function EarningsCalendar() {
  const { data, isLoading } = useSWR<EarningsEvent[]>(
    '/api/v1/macro/earnings-calendar?days_ahead=14',
    swrFetcher,
    { refreshInterval: 3_600_000 }
  )

  if (isLoading) {
    return (
      <div className="card animate-pulse space-y-2">
        <div className="h-2.5 w-28 rounded mx-auto" style={{ background: '#1a3050' }} />
        {[1, 2, 3].map(i => <div key={i} className="h-8 rounded" style={{ background: '#1a3050' }} />)}
      </div>
    )
  }

  const groups = groupByDate(data ?? [])

  return (
    <div className="card">
      <div className="section-header">
        <span className="text-sm">📅</span>
        <span className="section-title" style={{ color: '#a5b4fc' }}>Earnings Calendar</span>
        <span className="text-[9px] text-muted">Next 14 days</span>
        <span className="badge badge-neutral text-[9px] ml-auto">{data?.length ?? 0}</span>
      </div>

      {!groups.length ? (
        <p className="text-center text-muted text-[10px] py-4">No earnings in next 14 days</p>
      ) : (
        <div className="space-y-2">
          {groups.slice(0, 4).map(([date, events]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[9px] font-bold text-brand uppercase tracking-wider">
                  {formatDate(date)}
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--border-default)' }} />
                <span className="text-[9px] text-muted">{events.length} co.</span>
              </div>
              <div className="space-y-px">
                {events.slice(0, 5).map(e => (
                  <div key={e.symbol} className="flex items-center gap-1.5 px-1 py-0.5 rounded transition-colors" onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'} onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                    <TimeBadge time={e.time_of_day} />
                    <span className="text-[11px] font-bold text-text-primary w-12 flex-shrink-0">{e.symbol}</span>
                    <span className="text-[9px] text-muted flex-1 truncate">{e.company}</span>
                    {e.eps_estimate !== null && (
                      <span className="text-[9px] text-muted num">est ${e.eps_estimate?.toFixed(2)}</span>
                    )}
                    <SurpriseBadge pct={e.surprise_pct} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Legend */}
      <div className="flex items-center gap-3 mt-2 pt-1.5" style={{ borderTop: '1px solid var(--border-default)' }}>
        <span className="text-[8px] text-muted">BMO = Before Market Open</span>
        <span className="text-[8px] text-muted">AMC = After Market Close</span>
      </div>
    </div>
  )
}
