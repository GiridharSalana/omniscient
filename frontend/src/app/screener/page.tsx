'use client'

import { useState, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { swrFetcher } from '@/lib/api'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  RefreshCw, Database, Zap, AlertCircle,
  ArrowUpRight, ArrowDownRight, ChevronRight,
  BarChart3, SlidersHorizontal, Target,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ScreenerResponse } from '@/lib/types'

// ── Preset tiles configuration ────────────────────────────────────
const PRESETS = [
  { id: 'momentum_breakout', label: 'Momentum',     desc: '1D ≥ 2%, vol ≥ 1.5×',     icon: '🚀', color: '#00d68f', accent: 'rgba(0,214,143,0.08)'  },
  { id: 'oversold_bounce',   label: 'Reversal',     desc: 'RSI ≤ 35, above 200 SMA',  icon: '📈', color: '#4ade80', accent: 'rgba(74,222,128,0.08)' },
  { id: 'near_52w_high',     label: '52W Highs',    desc: 'Within 2% of 52-week high', icon: '🏔️', color: '#a78bfa', accent: 'rgba(167,139,250,0.08)' },
  { id: 'volume_surge',      label: 'Vol Surge',    desc: 'Vol ≥ 2.5× 20D average',   icon: '⚡', color: '#f59e0b', accent: 'rgba(245,158,11,0.08)'  },
  { id: 'gap_up',            label: 'Gap Up',       desc: 'Opened ≥ 1% above close',  icon: '⬆️', color: '#00d68f', accent: 'rgba(0,214,143,0.08)'  },
  { id: 'gap_down',          label: 'Gap Down',     desc: 'Opened ≥ 1% below close',  icon: '⬇️', color: '#f0384f', accent: 'rgba(240,56,79,0.08)'  },
  { id: 'strong_trend',      label: 'Uptrend',      desc: 'P > SMA20 > SMA50 > 200',  icon: '📊', color: '#3b82f6', accent: 'rgba(59,130,246,0.08)'  },
  { id: 'golden_cross',      label: 'Golden Cross', desc: 'SMA50 crossed above SMA200',icon: '✨', color: '#fbbf24', accent: 'rgba(251,191,36,0.08)'  },
]

const REGIONS = [
  { id: 'all',   label: '🌍 All Markets' },
  { id: 'india', label: '🇮🇳 India (Nifty 50)' },
  { id: 'us',    label: '🇺🇸 US (Top 20)' },
]

// ── Signal config ─────────────────────────────────────────────────
const SIG = {
  strong_buy:  { color: '#00d68f', label: 'STRONG BUY',  bg: 'rgba(0,214,143,0.12)'  },
  buy:         { color: '#4ade80', label: 'BUY',         bg: 'rgba(74,222,128,0.10)' },
  hold:        { color: '#fbbf24', label: 'HOLD',        bg: 'rgba(251,191,36,0.10)' },
  sell:        { color: '#fb923c', label: 'SELL',        bg: 'rgba(251,146,60,0.10)' },
  strong_sell: { color: '#f0384f', label: 'STRONG SELL', bg: 'rgba(240,56,79,0.12)'  },
} as Record<string, { color: string; label: string; bg: string }>

// ── Mini RSI bar ──────────────────────────────────────────────────
function RsiBar({ rsi }: { rsi: number | null }) {
  if (rsi == null) return <span className="text-muted text-[9px]">—</span>
  const color = rsi <= 30 ? '#00d68f' : rsi >= 70 ? '#ff4d6d' : '#fbbf24'
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-raised)' }}>
        <div style={{ width: `${Math.min(100, rsi)}%`, height: '100%', background: color }} />
      </div>
      <span className="num text-[10px] font-bold" style={{ color }}>{rsi.toFixed(0)}</span>
    </div>
  )
}

// ── Score badge ───────────────────────────────────────────────────
function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? '#05d98b' : score >= 50 ? '#fbbf24' : '#f0384f'
  return (
    <div className="flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0"
      style={{ background: `${color}12`, border: `2px solid ${color}50` }}>
      <span className="num text-[11px] font-bold" style={{ color }}>{score}</span>
    </div>
  )
}

// ── Seed prompt ───────────────────────────────────────────────────
function SeedPrompt({ onSeed, seeding }: { onSeed: () => void; seeding: boolean }) {
  return (
    <div className="flex flex-col items-center py-20 gap-5">
      <div className="w-24 h-24 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)' }}>
        <Database size={40} style={{ color: '#7c3aed' }} />
      </div>
      <div className="text-center">
        <div className="text-[15px] font-bold text-text-primary mb-2">Seed the screener universe</div>
        <p className="text-[11px] text-muted max-w-md">
          The screener needs 6 months of historical OHLCV data to compute RSI, moving averages, and volume ratios.
          This takes ~60 seconds and runs once.
        </p>
      </div>
      <button onClick={onSeed} disabled={seeding}
        className="btn btn-primary gap-2 px-8 py-3 text-[12px]">
        {seeding
          ? <><RefreshCw size={14} className="animate-spin" /> Seeding universe (60s)…</>
          : <><Zap size={14} /> Seed Nifty 50 + Top US Stocks</>}
      </button>
    </div>
  )
}

// ── Screener result card (for grid view) ─────────────────────────
function ResultCard({ r, onClick }: { r: any; onClick: () => void }) {
  const up = (r.change_pct ?? 0) >= 0
  const sig = SIG[r.overall] ?? SIG.hold
  return (
    <div onClick={onClick}
      className="group rounded-xl cursor-pointer overflow-hidden transition-all hover:scale-[1.02] hover:shadow-xl"
      style={{
        background: 'linear-gradient(145deg, #070f1d, #05091a)',
        border: `1px solid ${sig.color}30`,
        boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      }}>
      <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, transparent, ${sig.color}, transparent)` }} />
      <div className="p-3">
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="font-bold text-white text-[13px] leading-none mb-0.5">{r.symbol.replace('.NS','')}</div>
            {r.name && <div className="text-[9px] text-muted truncate max-w-[100px]">{r.name}</div>}
          </div>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
            style={{ color: sig.color, background: sig.bg, border: `1px solid ${sig.color}40` }}>
            {sig.label}
          </span>
        </div>
        <div className="flex items-baseline gap-1.5 mb-2">
          <span className="num text-[16px] font-bold text-white">
            {r.price != null ? (r.price >= 10000
              ? r.price.toLocaleString('en-IN', { maximumFractionDigits: 0 })
              : r.price.toFixed(2)) : '—'}
          </span>
          {r.change_pct != null && (
            <span className="num text-[11px] font-bold" style={{ color: up ? '#05d98b' : '#f0384f' }}>
              {up ? '+' : ''}{r.change_pct.toFixed(2)}%
            </span>
          )}
        </div>
        <RsiBar rsi={r.rsi_14} />
        {r.match_reason && (
          <div className="text-[9px] text-text-secondary mt-2 leading-tight">{r.match_reason}</div>
        )}
        <div className="flex justify-end mt-2">
          <ChevronRight size={12} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────
export default function ScreenerPage() {
  const router = useRouter()
  const [preset, setPreset]   = useState('momentum_breakout')
  const [region, setRegion]   = useState('all')
  const [view,   setView]     = useState<'grid' | 'table'>('table')
  const [seeding, setSeeding] = useState(false)

  const activePreset = PRESETS.find(p => p.id === preset)!

  const { data, isLoading, mutate, error } = useSWR<ScreenerResponse>(
    `/api/v1/screener/run?preset=${preset}&region=${region}`,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  )

  const noData = !isLoading && data?.universe === 0

  const handleSeed = useCallback(async () => {
    setSeeding(true)
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/api/v1/screener/seed-universe?region=${region}`,
        { method: 'POST' }
      )
      await mutate()
    } catch {}
    setSeeding(false)
  }, [region, mutate])

  return (
    <div className="p-3 space-y-3 animate-fade-in">

      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[18px] font-bold text-text-primary flex items-center gap-2">
            <SlidersHorizontal size={16} style={{ color: '#7c3aed' }} />
            Stock Screener
          </h1>
          <p className="text-[10px] text-muted mt-0.5">
            Filter global stocks by technical criteria · {data ? `${data.universe} symbols in universe` : 'Loading…'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background: '#070f1d', border: '1px solid #1a2235' }}>
            <button onClick={() => setView('grid')}
              className="p-2 rounded-md transition-colors"
              title="Grid view"
              style={{ background: view === 'grid' ? '#1e3a5f' : 'transparent', color: view === 'grid' ? '#93c5fd' : '#4b5d73' }}>
              <BarChart3 size={13} />
            </button>
            <button onClick={() => setView('table')}
              className="p-2 rounded-md transition-colors"
              title="Table view"
              style={{ background: view === 'table' ? '#1e3a5f' : 'transparent', color: view === 'table' ? '#93c5fd' : '#4b5d73' }}>
              <SlidersHorizontal size={13} />
            </button>
          </div>

          {/* Region */}
          <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background: '#070f1d', border: '1px solid #1a2235' }}>
            {REGIONS.map(r => (
              <button key={r.id} onClick={() => setRegion(r.id)}
                className="text-[10px] px-2.5 py-1.5 rounded-md font-medium transition-all whitespace-nowrap"
                style={{
                  background: region === r.id ? '#1e3a5f' : 'transparent',
                  color:      region === r.id ? '#93c5fd' : '#4b5d73',
                  border:     `1px solid ${region === r.id ? '#3b82f6' : 'transparent'}`,
                }}>
                {r.label}
              </button>
            ))}
          </div>

          <button onClick={() => mutate()}
            className="btn btn-ghost text-[10px] gap-1 px-2.5 py-1.5">
            <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Preset grid — 8 tiles ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {PRESETS.map(p => {
          const active = preset === p.id
          return (
            <button key={p.id} onClick={() => setPreset(p.id)}
              className="flex flex-col items-center text-center p-3 rounded-xl transition-all hover:scale-[1.04] active:scale-100"
              style={{
                background: active ? p.accent : 'var(--bg-raised)',
                border:     `1px solid ${active ? p.color + '70' : 'var(--border-default)'}`,
                boxShadow:  active ? `0 0 18px ${p.color}20, inset 0 1px 0 ${p.color}15` : 'none',
              }}>
              <span className="text-2xl mb-1 leading-none">{p.icon}</span>
              <span className="text-[10px] font-bold leading-tight"
                style={{ color: active ? p.color : 'var(--t2)' }}>
                {p.label}
              </span>
              <span className="text-[8px] text-muted mt-0.5 leading-tight hidden lg:block">{p.desc}</span>
            </button>
          )
        })}
      </div>

      {/* ── Active scan banner ────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-5 py-3 rounded-xl"
        style={{ background: `${activePreset.color}06`, border: `1px solid ${activePreset.color}25` }}>
        <span className="text-3xl leading-none flex-shrink-0">{activePreset.icon}</span>
        <div className="flex-1">
          <div className="text-[14px] font-bold" style={{ color: activePreset.color }}>{activePreset.label}</div>
          <div className="text-[10px] text-muted">{activePreset.desc}</div>
        </div>
        {!isLoading && data && (
          <div className="flex items-center gap-6 flex-shrink-0">
            <div className="text-center">
              <div className="num text-[26px] font-bold text-text-primary leading-none">{data.matched}</div>
              <div className="text-[9px] text-muted">matches</div>
            </div>
            <div className="text-center">
              <div className="num text-[16px] font-semibold text-text-secondary leading-none">{data.universe}</div>
              <div className="text-[9px] text-muted">universe</div>
            </div>
            {data.matched > 0 && (
              <div className="text-center">
                <div className="num text-[16px] font-semibold leading-none" style={{ color: activePreset.color }}>
                  {((data.matched / data.universe) * 100).toFixed(1)}%
                </div>
                <div className="text-[9px] text-muted">hit rate</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Results ───────────────────────────────────────────────── */}
      {isLoading ? (
        view === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="skeleton rounded-xl" style={{ height: 160, animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="skeleton h-10 rounded-lg" style={{ animationDelay: `${i * 50}ms` }} />
            ))}
          </div>
        )
      ) : noData ? (
        <SeedPrompt onSeed={handleSeed} seeding={seeding} />
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <AlertCircle size={24} className="text-bear" />
          <div className="text-[12px] text-text-secondary">Failed to load screener</div>
          <button onClick={() => mutate()} className="btn btn-ghost text-[11px]">Retry</button>
        </div>
      ) : !data?.results?.length ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <div className="text-4xl">🔍</div>
          <div className="text-[13px] font-semibold text-text-secondary">No matches in this scan</div>
          <p className="text-[10px] text-muted text-center max-w-sm">
            Try a different preset or region. Markets may not have today's data yet.
          </p>
        </div>
      ) : view === 'grid' ? (

        /* Grid view */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {data.results.map((r, idx) => {
            const n = data.results.length
            const cols = 4
            const rem = n % cols
            const isLastOrphan = rem === 1 && idx === n - 1
            return (
              <div key={r.symbol} className={isLastOrphan ? 'col-span-2 sm:col-span-3 lg:col-span-2 lg:mx-auto lg:w-1/2' : ''}>
                <ResultCard r={r} onClick={() => router.push(`/stock/${r.symbol}`)} />
              </div>
            )
          })}
        </div>

      ) : (

        /* Table view */
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border-default)' }}>
                  {['#', 'Symbol', 'Price', '1D %', 'Vol Ratio', 'RSI', 'Trend', 'MA Cross', 'Signal', 'Why'].map((h, i) => (
                    <th key={h} className={cn(
                      'text-[9px] text-muted uppercase tracking-wider px-3 py-2.5 font-semibold',
                      i === 0 ? 'text-center w-8' : 'text-left',
                    )}>{h}</th>
                  ))}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {data.results.map((r, i) => {
                  const up  = (r.change_pct ?? 0) >= 0
                  const sig = SIG[r.overall] ?? SIG.hold
                  return (
                    <tr key={r.symbol}
                      onClick={() => router.push(`/stock/${r.symbol}`)}
                      className="transition-colors cursor-pointer group"
                      style={{ borderBottom: '1px solid var(--border-dim)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                      <td className="px-3 py-2.5 text-center">
                        <span className="text-[9px] text-muted">{i + 1}</span>
                      </td>

                      <td className="px-3 py-2.5">
                        <div className="font-bold text-[12px] leading-none" style={{ color: activePreset.color }}>{r.symbol}</div>
                        {r.name && <div className="text-[9px] text-muted truncate max-w-[100px] mt-0.5">{r.name}</div>}
                      </td>

                      <td className="px-3 py-2.5">
                        <span className="num text-[11px] font-semibold text-text-primary">
                          {r.price != null ? (r.price >= 10000
                            ? r.price.toLocaleString('en-IN', { maximumFractionDigits: 0 })
                            : r.price.toFixed(2)) : '—'}
                        </span>
                      </td>

                      <td className="px-3 py-2.5">
                        {r.change_pct != null && (
                          <span className="num text-[11px] font-bold flex items-center gap-0.5"
                            style={{ color: up ? '#05d98b' : '#f0384f' }}>
                            {up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                            {up ? '+' : ''}{r.change_pct.toFixed(2)}%
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2.5">
                        {r.volume_ratio != null ? (
                          <span className="num text-[10px] font-semibold"
                            style={{ color: r.volume_ratio >= 2.5 ? 'var(--warn)' : r.volume_ratio >= 1.5 ? 'var(--info)' : 'var(--t3)' }}>
                            {r.volume_ratio.toFixed(1)}×
                          </span>
                        ) : <span className="text-muted text-[9px]">—</span>}
                      </td>

                      <td className="px-3 py-2.5">
                        <RsiBar rsi={r.rsi_14} />
                      </td>

                      <td className="px-3 py-2.5">
                        <span className="text-[9px] font-semibold capitalize"
                          style={{ color: r.trend_signal === 'bullish' ? '#05d98b' : r.trend_signal === 'bearish' ? '#f0384f' : '#fbbf24' }}>
                          {r.trend_signal === 'bullish' ? '▲ ' : r.trend_signal === 'bearish' ? '▼ ' : '◆ '}
                          {r.trend_signal}
                        </span>
                      </td>

                      <td className="px-3 py-2.5">
                        {r.ma_cross !== 'none' ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                            style={{
                              color: r.ma_cross === 'golden_cross' ? '#fbbf24' : '#f0384f',
                              background: r.ma_cross === 'golden_cross' ? 'rgba(251,191,36,0.1)' : 'rgba(240,56,79,0.1)',
                            }}>
                            {r.ma_cross === 'golden_cross' ? '✨ Golden' : '💀 Death'}
                          </span>
                        ) : <span className="text-muted text-[9px]">—</span>}
                      </td>

                      <td className="px-3 py-2.5">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
                          style={{ color: sig.color, background: sig.bg, border: `1px solid ${sig.color}40` }}>
                          {sig.label}
                        </span>
                      </td>

                      <td className="px-3 py-2.5 max-w-[160px]">
                        <span className="text-[9px] text-text-secondary">{r.match_reason}</span>
                      </td>

                      <td className="px-2 py-2.5">
                        <ChevronRight size={12} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-2.5"
            style={{ background: 'rgba(5,9,26,0.8)', borderTop: '1px solid #1a2235' }}>
            <span className="text-[9px] text-muted">
              {data.results.length} of {data.matched} matches · {data.universe} symbols in universe
            </span>
            <span className="text-[9px] text-muted flex items-center gap-1">
              <Zap size={9} className="text-warn" /> Click row to open full chart + AI analysis
            </span>
          </div>
        </div>
      )}

      {/* ── Legend ───────────────────────────────────────────────── */}
      {!noData && !isLoading && (
        <div className="flex flex-wrap gap-4 text-[9px] text-muted px-1">
          <span>RSI: <span style={{ color: '#05d98b' }}>≤30 oversold</span> · <span style={{ color: '#f0384f' }}>≥70 overbought</span></span>
          <span>Vol: 1× = avg · 2× = high · 3× = surge</span>
          <span>Signal: RSI + MA trend + MACD + volume composite</span>
          <Link href="/dashboard" className="ml-auto text-brand hover:underline flex items-center gap-1">
            <Target size={9} /> See all opportunities →
          </Link>
        </div>
      )}
    </div>
  )
}
