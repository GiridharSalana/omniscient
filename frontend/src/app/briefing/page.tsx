'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { swrFetcher, api } from '@/lib/api'
import type { BriefingResponse } from '@/lib/types'
import { cn, formatDate, regimeBg } from '@/lib/utils'
import { Activity, RefreshCw, Zap, FileText } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Loader } from '@/components/shared/Loader'

// Strip stray ** from key-theme strings that come from the LLM
const cleanTheme = (t: string) => t.replace(/\*\*/g, '').trim()

// Regime pill colours via CSS variables
const regimePill: Record<string, { color: string; bg: string; border: string }> = {
  'risk-on':    { color: '#00d68f', bg: 'rgba(0,214,143,0.12)',   border: 'rgba(0,214,143,0.35)'   },
  'risk-off':   { color: '#f0384f', bg: 'rgba(240,56,79,0.12)',   border: 'rgba(240,56,79,0.35)'   },
  'transition': { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.35)'  },
  'neutral':    { color: '#7dd3fc', bg: 'rgba(125,211,252,0.10)', border: 'rgba(125,211,252,0.30)' },
}
const getRegime = (r: string) => regimePill[r.toLowerCase()] ?? regimePill['neutral']

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
    <div className="p-3 space-y-3 animate-fade-in">

      {/* ── Page header — 3-col grid so title is always centred ── */}
      <div className="grid items-center" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
        <div />
        <div className="flex items-center gap-2">
          <Activity size={16} style={{ color: 'var(--brand)' }} />
          <h1 className="text-[16px] font-bold uppercase tracking-widest" style={{ color: 'var(--t1)' }}>
            Morning Briefing
          </h1>
        </div>
        <div className="flex justify-end">
          <button onClick={generate} disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
            style={{ background: 'var(--brand)', color: '#fff', opacity: generating ? 0.7 : 1 }}>
            <Zap size={12} className={generating ? 'animate-pulse' : ''} />
            {generating ? 'Generating…' : 'Generate Now'}
          </button>
        </div>
      </div>

      {genError && (
        <div className="text-center py-3 rounded-xl text-[12px]"
          style={{ background: 'rgba(240,56,79,0.08)', border: '1px solid rgba(240,56,79,0.25)', color: '#f0384f' }}>
          {genError}
          <span className="block text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>
            Check API keys in .env — Cohere preferred for briefings
          </span>
        </div>
      )}

      {/* ── History strip — horizontal scrollable row ────────── */}
      {history && history.length > 0 && (
        <div className="rounded-xl px-4 py-2.5 overflow-x-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', scrollbarWidth: 'none' }}>
          <div className="flex items-center gap-2 min-w-max mx-auto justify-center">
            <div className="flex items-center gap-1.5 mr-3 flex-shrink-0">
              <RefreshCw size={11} style={{ color: 'var(--t3)' }} />
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--t3)' }}>History</span>
            </div>
            {history.map(b => {
              const rp     = b.risk_regime ? getRegime(b.risk_regime) : null
              const active = selectedId === b.id || (!selectedId && b.id === latest?.id)
              return (
                <button key={b.id}
                  onClick={() => setSelectedId(b.id === selectedId ? null : b.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all flex-shrink-0"
                  style={{
                    background: active ? 'rgba(124,58,237,0.10)' : 'var(--bg-raised)',
                    border: `1px solid ${active ? 'rgba(124,58,237,0.4)' : 'var(--border-default)'}`,
                  }}>
                  <span className="text-[11px] font-medium" style={{ color: active ? 'var(--t1)' : 'var(--t2)' }}>
                    {formatDate(b.briefing_date)}
                  </span>
                  {rp && (
                    <span className="text-[10px] px-1.5 py-px rounded font-bold"
                      style={{ color: rp.color, background: rp.bg, border: `1px solid ${rp.border}` }}>
                      {b.risk_regime!.toUpperCase()}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Full-width briefing content ───────────────────────── */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
          {!selected ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <FileText size={32} style={{ color: 'var(--t3)' }} />
              <p className="text-[13px]" style={{ color: 'var(--t2)' }}>No briefing available</p>
              <p className="text-[11px]" style={{ color: 'var(--t3)' }}>
                Generates automatically at 6 AM IST or click Generate Now
              </p>
            </div>
          ) : (
            <>
              {/* Briefing meta — centred */}
              <div className="flex flex-col items-center gap-2 pb-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  <span className="text-[13px] font-semibold" style={{ color: 'var(--t1)' }}>
                    {formatDate(selected.briefing_date)}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-md font-medium"
                    style={{ background: 'var(--bg-raised)', color: 'var(--t2)', border: '1px solid var(--border-default)' }}>
                    {selected.provider.toUpperCase()}
                  </span>
                  {selected.risk_regime && (() => {
                    const rp = getRegime(selected.risk_regime)
                    return (
                      <span className="text-[11px] px-2.5 py-0.5 rounded-md font-bold"
                        style={{ color: rp.color, background: rp.bg, border: `1px solid ${rp.border}` }}>
                        {selected.risk_regime.toUpperCase()}
                      </span>
                    )
                  })()}
                </div>

                {/* Key themes — centred, cleaned */}
                {selected.key_themes.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-1.5 mt-1">
                    {selected.key_themes.map((t, i) => (
                      <span key={i} className="text-[11px] px-2.5 py-0.5 rounded-full font-medium"
                        style={{ background: 'var(--bg-raised)', color: 'var(--t2)', border: '1px solid var(--border-default)' }}>
                        {cleanTheme(t)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Markdown content */}
              <div className="space-y-1 text-[13px] leading-relaxed" style={{ color: 'var(--t2)' }}>
                <ReactMarkdown
                  components={{
                    h2: ({ children }) => (
                      <h2 className="text-[14px] font-bold uppercase tracking-wide mt-5 mb-2 pb-1.5 flex items-center gap-2"
                        style={{ color: 'var(--t1)', borderBottom: '1px solid var(--border-default)' }}>
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-[13px] font-semibold mt-3 mb-1" style={{ color: '#93c5fd' }}>
                        {children}
                      </h3>
                    ),
                    ul: ({ children }) => <ul className="space-y-1.5 ml-4 list-disc">{children}</ul>,
                    li: ({ children }) => <li className="text-[13px]" style={{ color: 'var(--t2)' }}>{children}</li>,
                    p:  ({ children }) => <p className="text-[13px]" style={{ color: 'var(--t2)' }}>{children}</p>,
                    strong: ({ children }) => (
                      <strong style={{ color: 'var(--t1)', fontWeight: 600 }}>{children}</strong>
                    ),
                    em: ({ children }) => (
                      <em style={{ color: 'var(--t2)', fontStyle: 'italic' }}>{children}</em>
                    ),
                  }}
                >
                  {selected.content}
                </ReactMarkdown>
              </div>
            </>
          )}
        </div>

    </div>
  )
}
