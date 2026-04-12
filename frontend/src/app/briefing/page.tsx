'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { swrFetcher, api } from '@/lib/api'
import type { BriefingResponse } from '@/lib/types'
import { cn, formatDate, regimeBg } from '@/lib/utils'
import { Activity, RefreshCw, Zap } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Loader } from '@/components/shared/Loader'

export default function BriefingPage() {
  const [generating, setGenerating] = useState(false)
  const [genError,   setGenError]   = useState<string | null>(null)

  const { data: latest, isLoading, mutate } = useSWR<BriefingResponse>(
    '/api/v1/briefing/latest', swrFetcher
  )
  const { data: history } = useSWR<BriefingResponse[]>(
    '/api/v1/briefing/history', swrFetcher
  )

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selected = selectedId ? history?.find(b => b.id === selectedId) : latest

  const generate = async () => {
    setGenerating(true)
    setGenError(null)
    try {
      await api.briefing.generate()
      await mutate()
    } catch (e: any) {
      setGenError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  if (isLoading) return <Loader message="Loading briefing..." />

  return (
    <div className="p-2 space-y-2 animate-fade-in">

      {/* ── Header — centered ───────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-brand" />
          <h1 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Morning Briefing</h1>
        </div>
        <div className="flex-1 flex justify-end">
          <button onClick={generate} disabled={generating} className="btn btn-primary gap-1.5">
            <Zap size={12} className={generating ? 'animate-pulse' : ''} />
            {generating ? 'Generating...' : 'Generate Now'}
          </button>
        </div>
      </div>

      {genError && (
        <div className="card border-bear/30 bg-bear/5 text-center">
          <p className="text-[12px] text-bear">{genError}</p>
          <p className="text-[11px] text-muted mt-1">Check API keys in .env — Cohere preferred for briefings</p>
        </div>
      )}

      {/* ── Two-column: Briefing content (wider) | History (narrow) */}
      <div className="grid grid-cols-[2fr_1fr] gap-2 items-start">

        {/* Left: Full briefing */}
        <div className="card space-y-2">
          {!selected ? (
            <div className="text-center py-6">
              <Activity size={24} className="text-muted mx-auto mb-2" />
              <p className="text-xs text-text-primary">No briefing available</p>
              <p className="text-[10px] text-muted mt-0.5">Generates automatically at 6 AM IST or click Generate Now</p>
            </div>
          ) : (
            <>
              {/* Briefing header — centered */}
              <div className="section-header">
                <Activity size={13} className="text-brand" />
                <span className="section-title">
                  {formatDate(selected.briefing_date)}
                </span>
                <span className="badge border border-[#1c2030] text-[10px] text-muted px-2 py-0.5">
                  {selected.provider.toUpperCase()}
                </span>
                {selected.risk_regime && (
                  <span className={cn('badge border text-[10px] px-2 py-0.5', regimeBg(selected.risk_regime as any))}>
                    {selected.risk_regime.toUpperCase()}
                  </span>
                )}
              </div>

              {/* Key themes — compact pills */}
              {selected.key_themes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selected.key_themes.map((t, i) => (
                    <span key={i} className="badge border border-[#2d3452] text-[9px] text-text-secondary px-1.5 py-px">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {/* Content */}
              <div className="prose-sm space-y-2 text-[12px] leading-relaxed" style={{ color: '#8da3bf' }}>
                <ReactMarkdown
                  components={{
                    h2: ({children}) => (
                      <h2 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider mt-4 mb-2 pb-1"
                          style={{ color: '#e2e8f0', borderBottom: '1px solid #1a3050' }}>
                        {children}
                      </h2>
                    ),
                    h3: ({children}) => (
                      <h3 className="text-[11px] font-semibold mt-2 mb-1" style={{ color: '#93c5fd' }}>{children}</h3>
                    ),
                    ul: ({children}) => <ul className="space-y-1 ml-4 list-disc">{children}</ul>,
                    li: ({children}) => <li className="text-[12px]">{children}</li>,
                    p:  ({children}) => <p className="text-[12px]">{children}</p>,
                    strong: ({children}) => <strong style={{ color: '#e2e8f0', fontWeight: 600 }}>{children}</strong>,
                  }}
                >
                  {selected.content}
                </ReactMarkdown>
              </div>
            </>
          )}
        </div>

        {/* Right: History — mirrored card structure */}
        <div className="card">
          <div className="section-header">
            <RefreshCw size={12} className="text-muted" />
            <span className="section-title">Briefing History</span>
          </div>

          <div className="space-y-1.5">
            {!history?.length && (
              <div className="text-center py-4 text-muted text-xs">No briefing history yet</div>
            )}
            {history?.map(b => (
              <button
                key={b.id}
                onClick={() => setSelectedId(b.id === selectedId ? null : b.id)}
                className={cn(
                  'w-full flex items-center justify-between p-2.5 rounded border transition-all text-left',
                  (selectedId === b.id || (!selectedId && b.id === latest?.id))
                    ? 'border-brand/40 bg-brand/5'
                    : 'border-[#1c2030] bg-[#13161f] hover:bg-[#1a1e2e] hover:border-[#2d3452]'
                )}
              >
                <div>
                  <div className="text-[12px] text-text-primary">{formatDate(b.briefing_date)}</div>
                  {b.risk_regime && (
                    <span className={cn('badge border text-[9px] mt-0.5', regimeBg(b.risk_regime as any))}>
                      {b.risk_regime}
                    </span>
                  )}
                </div>
                <span className="badge border border-[#1c2030] text-[9px] text-muted px-1.5 py-0.5">
                  {b.provider}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
