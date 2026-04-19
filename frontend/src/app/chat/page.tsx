'use client'

import { useState, useRef, useEffect } from 'react'
import useSWR from 'swr'
import { api, swrFetcher } from '@/lib/api'
import type { ChatResponse, TechSignal, MacroSnapshot } from '@/lib/types'
import { cn, formatDateTime } from '@/lib/utils'
import { Send, Zap, RotateCcw, BookOpen, TrendingUp, Globe, AlertTriangle, BarChart2, DollarSign, Newspaper } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

interface Message {
  role:      'user' | 'assistant'
  content:   string
  provider?: string
  latency?:  number
  sources?:  ChatResponse['sources']
  ts:        string
}

// Categorized suggestions for richer UI
const SUGGESTION_CATEGORIES = [
  {
    icon: TrendingUp,
    label: 'Momentum',
    color: '#00d68f',
    questions: [
      'Which stocks have the strongest momentum today?',
      'Show me overbought stocks I should watch for reversal',
      'What sectors are leading the market this week?',
    ],
  },
  {
    icon: Globe,
    label: 'Macro',
    color: '#38bdf8',
    questions: [
      'How does the yield curve look and what does it mean?',
      'Is the Fed likely to cut rates this year?',
      'What is the macro regime right now — risk-on or risk-off?',
    ],
  },
  {
    icon: AlertTriangle,
    label: 'Risk',
    color: '#fbbf24',
    questions: [
      'What are the key market risks for the week ahead?',
      'How does a VIX spike affect portfolio positioning?',
      'Explain the credit spread and what 173 bps means for equities',
    ],
  },
  {
    icon: BarChart2,
    label: 'Technical',
    color: '#818cf8',
    questions: [
      'Why is AMZN RSI showing overbought — is it a sell signal?',
      'Explain the difference between a golden cross and death cross',
      'Which watchlist stocks are technically oversold right now?',
    ],
  },
  {
    icon: DollarSign,
    label: 'Fundamentals',
    color: '#fbbf24',
    questions: [
      'What sectors benefit when the yield curve steepens?',
      'How does rising inflation affect growth vs value stocks?',
      'Explain what a 3.32% CPI means for the stock market',
    ],
  },
  {
    icon: Newspaper,
    label: 'News Analysis',
    color: '#ff4d6d',
    questions: [
      'Summarize the most impactful bearish news today',
      "Why are FPIs selling India — what's driving it?",
      'What is the market impact of US-Iran peace talks failing?',
    ],
  },
]

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [useRag, setUseRag]     = useState(true)
  const bottomRef               = useRef<HTMLDivElement>(null)

  const { data: techData }  = useSWR<TechSignal[]>('/api/v1/technical/signals', swrFetcher, { refreshInterval: 300_000 })
  const { data: macroData } = useSWR<MacroSnapshot>('/api/v1/macro/snapshot', swrFetcher, { refreshInterval: 600_000 })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    const userMsg: Message = { role: 'user', content: msg, ts: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    try {
      const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }))
      const res = await api.chat.message({ message: msg, history, use_rag: useRag }) as ChatResponse
      setMessages(prev => [...prev, {
        role: 'assistant', content: res.answer, provider: res.provider,
        latency: res.latency_ms, sources: res.sources, ts: new Date().toISOString(),
      }])
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${err.message ?? 'AI unavailable — check your API keys in .env'}`,
        ts: new Date().toISOString(),
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-[calc(100vh-52px)] flex flex-col p-2 gap-2">

      {/* Header */}
      <div className="grid items-center" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
        <div />
        <div className="flex items-center gap-2">
          <Zap size={14} style={{ color: '#818cf8' }} />
          <h1 className="text-sm font-semibold text-text-primary uppercase tracking-wider">AI Market Intelligence</h1>
        </div>
        <div className="flex justify-end gap-2 items-center">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <span className="text-[10px] text-muted">RAG</span>
            <div onClick={() => setUseRag(v => !v)}
              className={cn('w-8 h-4 rounded-full transition-colors relative cursor-pointer', useRag ? 'bg-brand' : '')}
              style={useRag ? undefined : { background: 'var(--bg-raised)', border: '1px solid var(--border-default)' }}>
              <span className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all', useRag ? 'left-[18px]' : 'left-0.5')} />
            </div>
          </label>
          <button onClick={() => setMessages([])} className="btn btn-ghost gap-1">
            <RotateCcw size={10} /> Clear
          </button>
        </div>
      </div>

      {/* Full-width conversation */}
      <div className="flex-1 flex flex-col min-h-0">

        {/* Conversation */}
        <div className="card flex flex-col min-h-0 flex-1">
          <div className="section-header">
            <span className="section-title" style={{ color: '#a5b4fc' }}>Conversation</span>
            <span className="text-[9px] text-muted ml-auto">Cerebras → Google AI → Cohere{useRag ? ' · RAG' : ''}</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                <div className="relative">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center"
                       style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)', border: '1px solid rgba(99,102,241,0.3)' }}>
                    <Zap size={24} style={{ color: '#818cf8' }} />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-bull flex items-center justify-center"
                       style={{ boxShadow: '0 0 8px rgba(0,214,143,0.5)' }}>
                    <span className="text-[8px] font-bold text-black">AI</span>
                  </div>
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-text-primary">Ask me anything about markets</p>
                  <p className="text-[10px] text-muted mt-0.5">RAG over live news · Technical analysis · Macro context</p>
                </div>
                <p className="text-[10px] text-muted">Pick a prompt below or type your own question</p>

                {/* Suggestion categories grid */}
                <div className="w-full grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 mt-2 max-w-5xl">
                  {SUGGESTION_CATEGORIES.map(cat => {
                    const Icon = cat.icon
                    return (
                      <div key={cat.label} className="rounded-lg p-2.5 text-left space-y-1.5"
                           style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-default)' }}>
                        <div className="flex items-center gap-1.5">
                          <Icon size={12} style={{ color: cat.color }} />
                          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: cat.color }}>{cat.label}</span>
                        </div>
                        <div className="space-y-1">
                          {cat.questions.map(q => (
                            <button key={q} onClick={() => send(q)}
                              className="block w-full text-left text-[10px] text-text-secondary hover:text-text-primary transition-colors leading-snug">
                              · {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Live market context chips */}
                {(techData || macroData) && (
                  <div className="w-full mt-2 space-y-2">
                    {/* Macro regime */}
                    {macroData && (
                      <div className="flex items-center gap-2 justify-center flex-wrap">
                        <span className="text-[9px] text-muted uppercase tracking-wider">Macro Regime:</span>
                        <span className={cn('badge text-[9px] font-semibold',
                          macroData.regime_signal === 'risk-on' ? 'badge-bull' :
                          macroData.regime_signal === 'risk-off' ? 'badge-bear' : 'badge-warn'
                        )}>
                          {macroData.regime_signal.toUpperCase()}
                        </span>
                        {macroData.indicators.slice(0, 3).map(ind => (
                          <span key={ind.key} className="text-[9px] text-muted">
                            {ind.label}: <span className={cn('font-semibold', ind.signal === 'bullish' ? 'text-bull' : ind.signal === 'bearish' ? 'text-bear' : 'text-warn')}>
                              {ind.value?.toFixed(2)}{ind.unit === '%' ? '%' : ''}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Technical signals */}
                    {techData && techData.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 justify-center">
                        {techData.slice(0, 6).map(t => {
                          const cfg = { strong_buy: { color: '#00d68f', label: '▲▲' }, buy: { color: '#00d68f', label: '▲' }, hold: { color: '#fbbf24', label: '◆' }, sell: { color: '#ff4d6d', label: '▼' }, strong_sell: { color: '#ff4d6d', label: '▼▼' } }[t.overall] ?? { color: '#fbbf24', label: '◆' }
                          return (
                            <div key={t.symbol} className="flex items-center gap-1 px-2 py-1 rounded text-[10px]"
                                 style={{ background: `${cfg.color}10`, border: `1px solid ${cfg.color}25` }}>
                              <span className="font-bold text-text-primary">{t.symbol}</span>
                              <span style={{ color: cfg.color }}>{cfg.label}</span>
                              <span className="text-muted">RSI {t.rsi_14?.toFixed(0)}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={cn('flex flex-col', msg.role === 'user' ? 'items-end' : 'items-start')}>
                <div className={msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}>
                  {msg.role === 'assistant' ? (
                    <div className="prose-sm text-[12px] text-text-primary leading-relaxed">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-[12px] text-text-primary">{msg.content}</p>
                  )}
                </div>
                <div className={cn('flex items-center gap-2 mt-0.5 px-1', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                  <span className="text-[9px] text-muted">{formatDateTime(msg.ts)}</span>
                  {msg.provider && <span className="badge badge-brand text-[8px]">{msg.provider}</span>}
                  {msg.latency && <span className="text-[9px] text-muted">{msg.latency}ms</span>}
                </div>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1 max-w-full">
                    {msg.sources.slice(0, 3).map((src, j) => (
                      <span key={j} className="badge badge-neutral text-[8px]">
                        <BookOpen size={7} className="inline mr-0.5" />
                        {src.source ?? 'News'} · {(src.similarity * 100).toFixed(0)}%
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="chat-bubble-ai flex items-center gap-2">
                <div className="flex gap-1">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                         style={{ background: '#6366f1', animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                <span className="text-[11px] text-muted">Thinking...</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="mt-2 flex gap-1.5">
            <input className="input flex-1" placeholder="Ask about markets, stocks, macro... (e.g. 'What is the trend for RELIANCE.NS?')"
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()} disabled={loading} />
            <button onClick={() => send()} disabled={!input.trim() || loading} className="btn btn-primary px-3">
              <Send size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
