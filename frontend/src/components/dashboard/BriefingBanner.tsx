'use client'

import useSWR from 'swr'
import { swrFetcher } from '@/lib/api'
import type { BriefingResponse } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { Activity, ChevronRight } from 'lucide-react'
import Link from 'next/link'

export function BriefingBanner() {
  const { data, isLoading, error } = useSWR<BriefingResponse>(
    '/api/v1/briefing/latest', swrFetcher, { refreshInterval: 3_600_000 }
  )

  return (
    <div className="card">
      {/* Header — centered */}
      <div className="section-header">
        <Activity size={12} style={{color:'#818cf8'}} />
        <span className="section-title" style={{color:'#a5b4fc'}}>Morning Briefing</span>
        {data && (
          <>
            <span className="badge badge-brand text-[9px]">{data.provider.toUpperCase()}</span>
            <span className="text-[10px] text-muted">{formatDate(data.briefing_date)}</span>
          </>
        )}
        <Link href="/briefing" className="ml-auto flex items-center gap-1 text-[10px] transition-colors" style={{color:'#818cf8'}}>
          Full briefing <ChevronRight size={10} />
        </Link>
      </div>

      {isLoading && (
        <div className="text-center py-4 text-muted text-xs">Loading briefing...</div>
      )}
      {error && (
        <div className="text-center py-4">
          <p className="text-muted text-xs">No briefing yet.</p>
          <p className="text-[11px] text-muted mt-1">Generates automatically at 6 AM IST</p>
        </div>
      )}
      {data && (
        <div className="space-y-3">
          {/* Key themes — centered pills, capped at 30 chars each */}
          {data.key_themes.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5 overflow-hidden max-h-8">
              {data.key_themes.slice(0, 5).map((theme, i) => (
                <span key={i} className="badge border border-[#2d3452] text-[10px] text-text-secondary px-2 py-0.5 max-w-[160px] truncate" title={theme}>
                  {theme.length > 28 ? theme.slice(0, 27) + '…' : theme}
                </span>
              ))}
            </div>
          )}

          {/* Briefing preview — first 2 paragraphs */}
          <div className="text-xs text-text-secondary leading-relaxed line-clamp-4 text-center max-w-4xl mx-auto">
            {data.content.split('\n').filter(l => l.trim() && !l.startsWith('#')).slice(0, 3).join(' ')}
          </div>
        </div>
      )}
    </div>
  )
}
