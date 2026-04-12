'use client'

import useSWR from 'swr'
import { swrFetcher } from '@/lib/api'
import { Calendar, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EconEvent {
  event_date:  string
  country:     string
  event_name:  string
  impact:      'low' | 'medium' | 'high'
  forecast:    string | null
  previous:    string | null
  actual:      string | null
}

interface FoEvent {
  date:  string
  label: string
  type:  'weekly' | 'monthly'
}

const IMPACT_COLOR: Record<string, string> = {
  high:   '#ff4d6d',
  medium: '#f59e0b',
  low:    '#4b5d73',
}

const COUNTRY_FLAG: Record<string, string> = {
  US: '🇺🇸', IN: '🇮🇳', EU: '🇪🇺', UK: '🇬🇧',
  JP: '🇯🇵', CN: '🇨🇳', AU: '🇦🇺', CA: '🇨🇦',
}

// India F&O expiry calculation (every Thursday for weekly, last Thursday of month for monthly)
function getNextExpiries(): FoEvent[] {
  const events: FoEvent[] = []
  const now = new Date()

  // Find next Thursday (weekly expiry)
  const nextThursday = new Date(now)
  const dayOfWeek = now.getDay()
  const daysUntilThursday = (4 - dayOfWeek + 7) % 7 || 7
  nextThursday.setDate(now.getDate() + daysUntilThursday)

  events.push({
    date:  nextThursday.toISOString().split('T')[0],
    label: 'NSE F&O Weekly Expiry',
    type:  'weekly',
  })

  // Last Thursday of current month (monthly expiry)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  while (lastDay.getDay() !== 4) lastDay.setDate(lastDay.getDate() - 1)
  if (lastDay > now) {
    events.push({
      date:  lastDay.toISOString().split('T')[0],
      label: 'NSE F&O Monthly Expiry',
      type:  'monthly',
    })
  }

  return events
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00')
  const today  = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

function formatDate(dateStr: string): string {
  const diff = daysUntil(dateStr)
  if (diff === 0) return 'TODAY'
  if (diff === 1) return 'TOM'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    month: 'short', day: 'numeric',
  })
}

export function EconEventsBar() {
  const { data, isLoading } = useSWR<EconEvent[]>(
    '/api/v1/market/economic-calendar?days_ahead=14',
    swrFetcher,
    { refreshInterval: 3_600_000 },
  )

  const foExpiries = getNextExpiries()

  // Filter to high/medium impact only for the bar
  const events = (data ?? [])
    .filter(e => e.impact !== 'low')
    .slice(0, 12)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto"
        style={{ background: 'rgba(10,22,40,0.6)', border: '1px solid #1a2235', borderRadius: 8 }}>
        <Calendar size={11} className="text-muted flex-shrink-0" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-5 w-28 rounded animate-pulse flex-shrink-0"
            style={{ background: '#1a2235' }} />
        ))}
      </div>
    )
  }

  if (!events.length && !foExpiries.length) return null

  return (
    <div className="flex items-center gap-0 overflow-x-auto scrollbar-hide"
      style={{ background: 'rgba(8,18,36,0.8)', border: '1px solid #1a2235', borderRadius: 8 }}>

      {/* Label */}
      <div className="flex items-center gap-1.5 px-3 py-2 flex-shrink-0 border-r border-[#1a2235]">
        <Calendar size={10} className="text-brand" />
        <span className="text-[9px] font-semibold text-brand uppercase tracking-wider">Events</span>
      </div>

      {/* F&O expiry pills */}
      {foExpiries.map(fo => {
        const diff = daysUntil(fo.date)
        const urgent = diff <= 2
        return (
          <div key={fo.date}
            className="flex items-center gap-1.5 px-3 py-2 flex-shrink-0 border-r border-[#1a2235]">
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded"
              style={{
                color:      fo.type === 'monthly' ? '#f59e0b' : '#a78bfa',
                background: fo.type === 'monthly' ? 'rgba(245,158,11,0.1)' : 'rgba(167,139,250,0.1)',
                border:     `1px solid ${fo.type === 'monthly' ? 'rgba(245,158,11,0.3)' : 'rgba(167,139,250,0.3)'}`,
              }}>
              {fo.type === 'monthly' ? 'MON' : 'WKL'}
            </span>
            <div>
              <div className="text-[9px] font-semibold text-text-secondary leading-none">{fo.label}</div>
              <div className="text-[8px] leading-none mt-0.5"
                style={{ color: urgent ? '#ff4d6d' : '#6b7c93' }}>
                {diff === 0 ? '🔴 TODAY' : diff === 1 ? '⚠️ Tomorrow' : `in ${diff}d · ${formatDate(fo.date)}`}
              </div>
            </div>
          </div>
        )
      })}

      {/* Economic events */}
      {events.map((e, i) => {
        const diff  = daysUntil(e.event_date)
        const color = IMPACT_COLOR[e.impact] ?? '#4b5d73'
        const flag  = COUNTRY_FLAG[e.country] ?? '🌐'
        const today = diff === 0
        return (
          <div key={i}
            className="flex items-center gap-2 px-3 py-2 flex-shrink-0 border-r border-[#1a2235]"
            style={{ background: today ? `${color}08` : 'transparent' }}>

            {/* Impact dot */}
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: color, boxShadow: today ? `0 0 6px ${color}` : 'none' }} />

            <div>
              <div className="flex items-center gap-1">
                <span className="text-[10px]">{flag}</span>
                <span className="text-[9px] font-semibold text-text-secondary leading-none">
                  {e.event_name.length > 24 ? e.event_name.slice(0, 24) + '…' : e.event_name}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[8px]" style={{ color: today ? color : '#4b5d73' }}>
                  {today ? '🔴 TODAY' : formatDate(e.event_date)}
                </span>
                {e.forecast && (
                  <span className="text-[8px] text-muted">est: {e.forecast}</span>
                )}
                {e.actual && (
                  <span className="text-[8px] font-bold" style={{ color }}>act: {e.actual}</span>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {/* "See all" link */}
      <div className="px-2 flex-shrink-0">
        <a href="/macro" className="flex items-center gap-0.5 text-[9px] text-muted hover:text-brand transition-colors whitespace-nowrap">
          All <ChevronRight size={9} />
        </a>
      </div>
    </div>
  )
}
