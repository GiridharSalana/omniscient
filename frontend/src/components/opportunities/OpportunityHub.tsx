'use client'

import useSWR from 'swr'
import { swrFetcher } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { useState, useMemo } from 'react'
import type { OpportunityItem, OpportunitiesResponse } from '@/lib/types'
import {
  TrendingUp, TrendingDown, RefreshCw, Database,
  SlidersHorizontal, Zap, Globe, ArrowUpRight, ArrowDownRight,
  ChevronRight, Star, Target, BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Filter configuration ───────────────────────────────────────────

const PRESET_FILTERS = [
  { id: 'all',               label: 'All',           icon: '🌐', color: '#7c3aed' },
  { id: 'momentum_breakout', label: 'Breakouts',     icon: '🚀', color: '#00d68f' },
  { id: 'oversold_bounce',   label: 'Reversals',     icon: '📈', color: '#4ade80' },
  { id: 'strong_trend',      label: 'Strong Trend',  icon: '📊', color: '#3b82f6' },
  { id: 'golden_cross',      label: 'Golden Cross',  icon: '✨', color: '#fbbf24' },
  { id: 'volume_surge',      label: 'Volume Surge',  icon: '⚡', color: '#f59e0b' },
  { id: 'near_52w_high',     label: '52W Highs',     icon: '🏔️', color: '#a78bfa' },
  { id: 'gap_up',            label: 'Gap Ups',       icon: '⬆️', color: '#00d68f' },
]

const REGION_FILTERS = [
  { id: 'all',   label: '🌍 All Markets' },
  { id: 'india', label: '🇮🇳 India' },
  { id: 'us',    label: '🇺🇸 US' },
]

const SIGNAL_COLORS: Record<string, { text: string; bg: string; border: string; label: string }> = {
  strong_buy:  { text: '#00d68f', bg: 'rgba(0,214,143,0.12)',  border: 'rgba(0,214,143,0.4)',  label: 'STRONG BUY'  },
  buy:         { text: '#4ade80', bg: 'rgba(74,222,128,0.10)', border: 'rgba(74,222,128,0.35)', label: 'BUY'         },
  hold:        { text: '#fbbf24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.30)', label: 'HOLD'        },
  sell:        { text: '#fb923c', bg: 'rgba(251,146,60,0.10)', border: 'rgba(251,146,60,0.30)', label: 'SELL'        },
  strong_sell: { text: '#f0384f', bg: 'rgba(240,56,79,0.12)',  border: 'rgba(240,56,79,0.4)',   label: 'STRONG SELL' },
}

// ── Score ring component ───────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 18
  const circumference = 2 * Math.PI * r
  const progress = (score / 100) * circumference
  const color = score >= 70 ? '#05d98b' : score >= 50 ? '#fbbf24' : '#f0384f'

  return (
    <div className="relative flex-shrink-0" style={{ width: 44, height: 44 }}>
      <svg width={44} height={44} viewBox="0 0 44 44" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={22} cy={22} r={r} fill="none" stroke="#1a2235" strokeWidth={3} />
        <circle cx={22} cy={22} r={r} fill="none"
          stroke={color} strokeWidth={3}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color}80)` }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="num text-[11px] font-bold" style={{ color }}>{score}</span>
      </div>
    </div>
  )
}

// ── Mini RSI bar ───────────────────────────────────────────────────

function RsiMini({ rsi }: { rsi: number | null }) {
  if (rsi == null) return <span className="text-muted text-[9px]">—</span>
  const color = rsi <= 30 ? '#05d98b' : rsi >= 70 ? '#f0384f' : '#fbbf24'
  const label = rsi <= 30 ? 'Oversold' : rsi >= 70 ? 'Overbought' : 'Neutral'
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[8px] text-muted">RSI</span>
        <span className="num text-[9px] font-bold" style={{ color }}>{rsi.toFixed(0)}</span>
      </div>
      <div className="w-full h-1 rounded-full bg-[#1a2235] overflow-hidden">
        <div style={{ width: `${Math.min(100, rsi)}%`, height: '100%', background: color }} />
      </div>
      <span className="text-[8px]" style={{ color }}>{label}</span>
    </div>
  )
}

// ── Volume mini ────────────────────────────────────────────────────

function VolMini({ ratio }: { ratio: number | null }) {
  if (ratio == null) return null
  const color = ratio >= 2.5 ? '#f59e0b' : ratio >= 1.5 ? '#06b6d4' : '#6b7c93'
  const bars = Math.min(5, Math.round(ratio))
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[8px] text-muted">Volume</span>
        <span className="num text-[9px] font-bold" style={{ color }}>{ratio.toFixed(1)}×</span>
      </div>
      <div className="flex items-end gap-0.5 h-3">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="flex-1 rounded-sm transition-all"
            style={{
              height: `${(i / 5) * 100}%`,
              background: i <= bars ? color : '#1a2235',
            }} />
        ))}
      </div>
    </div>
  )
}

// ── Opportunity Card ───────────────────────────────────────────────

function OpportunityCard({ item, onClick }: { item: OpportunityItem; onClick: () => void }) {
  const signal = SIGNAL_COLORS[item.overall] ?? SIGNAL_COLORS.hold
  const up = (item.change_pct ?? 0) >= 0
  const regionFlag = item.region === 'india' ? '🇮🇳' : item.region === 'us' ? '🇺🇸' : '🌐'

  return (
    <div onClick={onClick}
      className="group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-2xl"
      style={{
        background: 'linear-gradient(145deg, #070f1d, #05091a)',
        border: `1px solid ${item.primary_color}35`,
        boxShadow: `0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 ${item.primary_color}15`,
      }}>

      {/* Score accent line at top */}
      <div className="h-0.5 w-full" style={{
        background: `linear-gradient(90deg, transparent, ${item.primary_color}, transparent)`,
      }} />

      {/* Hover glow overlay */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${item.primary_color}08, transparent 60%)` }} />

      <div className="p-3.5 relative">

        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-sm leading-none">{regionFlag}</span>
              <span className="font-bold text-white text-[14px] tracking-tight leading-none">{item.symbol.replace('.NS', '')}</span>
              {item.ma_cross === 'golden_cross' && (
                <span className="text-[8px] px-1 py-0.5 rounded font-bold"
                  style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>
                  ✨ GX
                </span>
              )}
            </div>
            {item.name && (
              <div className="text-[9px] text-muted truncate leading-tight">{item.name}</div>
            )}
          </div>

          {/* Score ring */}
          <ScoreRing score={item.opportunity_score} />
        </div>

        {/* Price row */}
        <div className="flex items-baseline gap-2 mb-3">
          <span className="num text-[17px] font-bold text-white leading-none">
            {item.price != null
              ? item.price >= 10000
                ? item.price.toLocaleString('en-IN', { maximumFractionDigits: 0 })
                : item.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : '—'}
          </span>
          {item.change_pct != null && (
            <span className="num text-[12px] font-bold flex items-center gap-0.5"
              style={{ color: up ? '#05d98b' : '#f0384f' }}>
              {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {up ? '+' : ''}{item.change_pct.toFixed(2)}%
            </span>
          )}
        </div>

        {/* Signal + primary preset */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
            style={{ color: signal.text, background: signal.bg, border: `1px solid ${signal.border}` }}>
            {signal.label}
          </span>
          <span className="text-[8px] px-1.5 py-0.5 rounded whitespace-nowrap"
            style={{ color: item.primary_color, background: `${item.primary_color}12`, border: `1px solid ${item.primary_color}30` }}>
            {item.preset_icons[0] || '📊'} {item.primary_preset}
          </span>
        </div>

        {/* RSI + Volume mini indicators */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <RsiMini rsi={item.rsi_14} />
          <VolMini ratio={item.volume_ratio} />
        </div>

        {/* Match reasons */}
        <div className="space-y-1">
          {item.match_reasons.slice(0, 2).map((reason, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[10px] leading-none">{item.preset_icons[i] || '•'}</span>
              <span className="text-[9px] text-text-secondary leading-tight">{reason}</span>
            </div>
          ))}
          {item.matched_presets.length > 2 && (
            <div className="text-[8px] text-muted">+{item.matched_presets.length - 2} more signals</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-2.5"
          style={{ borderTop: `1px solid ${item.primary_color}20` }}>
          <div className="flex items-center gap-1">
            {item.pct_from_52w_high != null && (
              <span className="text-[8px] text-muted">
                {item.pct_from_52w_high >= -2
                  ? <span style={{ color: '#a78bfa' }}>🏔️ Near 52W high</span>
                  : `${item.pct_from_52w_high.toFixed(1)}% from high`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-muted group-hover:text-brand transition-colors">
            <span className="text-[9px]">Analyze</span>
            <ChevronRight size={11} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────

function EmptyState({ onSeed, seeding }: { onSeed: () => void; seeding: boolean }) {
  return (
    <div className="col-span-full flex flex-col items-center py-20 gap-4">
      <div className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
        <Database size={32} style={{ color: '#7c3aed' }} />
      </div>
      <div className="text-center">
        <div className="text-[15px] font-bold text-text-primary mb-1">No price data yet</div>
        <p className="text-[11px] text-muted max-w-sm">
          To surface opportunities, the system needs historical price data to compute RSI, moving averages,
          and volume ratios. Seed the universe first — it takes ~60 seconds.
        </p>
      </div>
      <button onClick={onSeed} disabled={seeding}
        className="btn btn-primary gap-2 px-6 py-2.5">
        {seeding
          ? <><RefreshCw size={13} className="animate-spin" /> Seeding universe…</>
          : <><Zap size={13} /> Seed Stock Universe</>}
      </button>
      <p className="text-[9px] text-muted">Fetches 6-month history for Nifty 50 + top US stocks (Yahoo Finance)</p>
    </div>
  )
}

// ── Main OpportunityHub ────────────────────────────────────────────

interface Props {
  defaultRegion?: string
}

export function OpportunityHub({ defaultRegion = 'all' }: Props) {
  const router  = useRouter()
  const [region, setRegion]   = useState(defaultRegion)
  const [filter, setFilter]   = useState('all')
  const [sortBy, setSortBy]   = useState<'score' | 'change' | 'rsi'>('score')
  const [seeding, setSeeding] = useState(false)
  const [view, setView]       = useState<'grid' | 'list'>('grid')

  const key = `/api/v1/screener/opportunities?region=${region}&min_score=20&limit=60`
  const { data, isLoading, mutate, error } = useSWR<OpportunitiesResponse>(
    key, swrFetcher, { refreshInterval: 300_000, revalidateOnFocus: false }
  )

  const filtered = useMemo(() => {
    let items = data?.opportunities ?? []
    if (filter !== 'all') {
      items = items.filter(o => o.matched_presets.includes(filter))
    }
    switch (sortBy) {
      case 'change': return [...items].sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0))
      case 'rsi':    return [...items].sort((a, b) => (a.rsi_14 ?? 50) - (b.rsi_14 ?? 50))
      default:       return items
    }
  }, [data, filter, sortBy])

  const noData = !isLoading && (data?.universe === 0 || (!data && !error))

  const handleSeed = async () => {
    setSeeding(true)
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/api/v1/screener/seed-universe?region=${region}`,
        { method: 'POST' }
      )
      await mutate()
    } catch {}
    setSeeding(false)
  }

  const activeFilter = PRESET_FILTERS.find(f => f.id === filter)

  return (
    <div className="flex flex-col gap-3">

      {/* ── Controls bar ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Region selector */}
        <div className="flex gap-0.5 p-0.5 rounded-lg flex-shrink-0"
          style={{ background: '#070f1d', border: '1px solid #1a2235' }}>
          {REGION_FILTERS.map(r => (
            <button key={r.id} onClick={() => setRegion(r.id)}
              className="text-[10px] px-3 py-1.5 rounded-md font-semibold transition-all"
              style={{
                background: region === r.id ? '#1e3a5f' : 'transparent',
                color:      region === r.id ? '#93c5fd' : '#4b5d73',
                border:     `1px solid ${region === r.id ? '#3b82f6' : 'transparent'}`,
              }}>
              {r.label}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-[#1a3050] flex-shrink-0" />

        {/* Preset filters */}
        <div className="flex gap-1 overflow-x-auto flex-1" style={{ scrollbarWidth: 'none' }}>
          {PRESET_FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap flex-shrink-0"
              style={{
                background: filter === f.id ? `${f.color}15` : 'rgba(7,15,29,0.8)',
                color:      filter === f.id ? f.color : '#4b5d73',
                border:     `1px solid ${filter === f.id ? f.color + '60' : '#1a2235'}`,
              }}>
              <span className="leading-none">{f.icon}</span>
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
          {/* Sort */}
          <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
            className="text-[9px] px-2 py-1.5 rounded-md outline-none cursor-pointer"
            style={{ background: '#0b1729', border: '1px solid #1a2235', color: '#8da3bf' }}>
            <option value="score">Sort: Score</option>
            <option value="change">Sort: Change%</option>
            <option value="rsi">Sort: RSI (lowest)</option>
          </select>

          {/* View toggle */}
          <div className="flex gap-0.5 p-0.5 rounded-md" style={{ background: '#070f1d', border: '1px solid #1a2235' }}>
            <button onClick={() => setView('grid')}
              className="p-1.5 rounded transition-colors"
              style={{ background: view === 'grid' ? '#1e3a5f' : 'transparent', color: view === 'grid' ? '#93c5fd' : '#4b5d73' }}>
              <BarChart3 size={12} />
            </button>
            <button onClick={() => setView('list')}
              className="p-1.5 rounded transition-colors"
              style={{ background: view === 'list' ? '#1e3a5f' : 'transparent', color: view === 'list' ? '#93c5fd' : '#4b5d73' }}>
              <SlidersHorizontal size={12} />
            </button>
          </div>

          {/* Refresh */}
          <button onClick={() => mutate()} disabled={isLoading}
            className="p-1.5 rounded-md transition-colors"
            style={{ background: '#0b1729', border: '1px solid #1a2235', color: '#8da3bf' }}
            title="Refresh opportunities">
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Stats bar ──────────────────────────────────────────────── */}
      {data && !isLoading && (
        <div className="flex items-center gap-4 px-3 py-2 rounded-lg text-[9px]"
          style={{ background: '#050912', border: '1px solid #111d30' }}>
          <div className="flex items-center gap-1.5">
            <Target size={10} style={{ color: '#7c3aed' }} />
            <span className="text-muted">Found</span>
            <span className="font-bold text-white num">{data.total_matched}</span>
            <span className="text-muted">opportunities</span>
          </div>
          <span style={{ color: '#1a3050' }}>·</span>
          <div className="flex items-center gap-1.5">
            <Globe size={10} className="text-muted" />
            <span className="text-muted">Universe:</span>
            <span className="font-bold text-white num">{data.universe}</span>
            <span className="text-muted">symbols</span>
          </div>
          <span style={{ color: '#1a3050' }}>·</span>
          <div className="flex items-center gap-1.5">
            <Star size={10} style={{ color: '#fbbf24' }} />
            <span className="text-muted">Presets run:</span>
            <span className="font-bold text-white num">{data.presets_run}</span>
          </div>
          {filter !== 'all' && (
            <>
              <span style={{ color: '#1a3050' }}>·</span>
              <div className="flex items-center gap-1.5">
                <span>{activeFilter?.icon}</span>
                <span className="font-bold" style={{ color: activeFilter?.color }}>{filtered.length} matching {activeFilter?.label}</span>
              </div>
            </>
          )}
          <div className="ml-auto text-muted">
            Refreshes every 5 min · <span style={{ color: '#05d98b' }}>Score ≥ 20</span>
          </div>
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className={view === 'grid'
          ? 'grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3'
          : 'flex flex-col gap-2'}>
          {[...Array(view === 'grid' ? 8 : 6)].map((_, i) => (
            <div key={i} className="skeleton rounded-xl"
              style={{ height: view === 'grid' ? 220 : 60, animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      ) : noData ? (
        <div className="grid grid-cols-1">
          <EmptyState onSeed={handleSeed} seeding={seeding} />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <div className="text-[13px] font-semibold text-text-secondary">Failed to load opportunities</div>
          <button onClick={() => mutate()} className="btn btn-ghost text-[11px]">Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <div className="text-3xl">🔍</div>
          <div className="text-[13px] font-semibold text-text-secondary">No matches for this filter</div>
          <button onClick={() => setFilter('all')} className="btn btn-ghost text-[11px]">Clear filter</button>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map(item => (
            <OpportunityCard
              key={item.symbol}
              item={item}
              onClick={() => router.push(`/stock/${item.symbol}`)}
            />
          ))}
        </div>
      ) : (
        /* List view */
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1a2235' }}>
          <table className="w-full">
            <thead>
              <tr style={{ background: 'rgba(5,9,26,0.9)', borderBottom: '1px solid #1a2235' }}>
                {['Score', 'Symbol', 'Price', 'Change', 'RSI', 'Volume', 'Signal', 'Why'].map((h, i) => (
                  <th key={h} className="text-[9px] text-muted uppercase tracking-wider px-3 py-2.5 text-left font-semibold">{h}</th>
                ))}
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => {
                const signal = SIGNAL_COLORS[item.overall] ?? SIGNAL_COLORS.hold
                const up = (item.change_pct ?? 0) >= 0
                const regionFlag = item.region === 'india' ? '🇮🇳' : '🇺🇸'
                const scoreColor = item.opportunity_score >= 70 ? '#05d98b' : item.opportunity_score >= 50 ? '#fbbf24' : '#f0384f'
                return (
                  <tr key={item.symbol}
                    onClick={() => router.push(`/stock/${item.symbol}`)}
                    className="border-b border-[#111d30] hover:bg-[#0a1525] cursor-pointer transition-colors group"
                    style={{ animationDelay: `${idx * 30}ms` }}>
                    <td className="px-3 py-2.5">
                      <span className="num text-[12px] font-bold" style={{ color: scoreColor }}>{item.opportunity_score}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">{regionFlag}</span>
                        <div>
                          <div className="font-bold text-white text-[12px] leading-none">{item.symbol.replace('.NS', '')}</div>
                          {item.name && <div className="text-[9px] text-muted truncate max-w-[100px]">{item.name}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="num text-[11px] text-text-primary font-semibold">
                        {item.price != null ? item.price >= 10000
                          ? item.price.toLocaleString('en-IN', { maximumFractionDigits: 0 })
                          : item.price.toFixed(2) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {item.change_pct != null && (
                        <span className="num text-[11px] font-bold flex items-center gap-0.5"
                          style={{ color: up ? '#05d98b' : '#f0384f' }}>
                          {up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                          {up ? '+' : ''}{item.change_pct.toFixed(2)}%
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {item.rsi_14 != null && (
                        <span className="num text-[10px] font-bold"
                          style={{ color: item.rsi_14 <= 30 ? '#05d98b' : item.rsi_14 >= 70 ? '#f0384f' : '#fbbf24' }}>
                          {item.rsi_14.toFixed(0)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {item.volume_ratio != null && (
                        <span className="num text-[10px]" style={{ color: item.volume_ratio >= 2 ? '#f59e0b' : '#6b7c93' }}>
                          {item.volume_ratio.toFixed(1)}×
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
                        style={{ color: signal.text, background: signal.bg, border: `1px solid ${signal.border}` }}>
                        {signal.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 max-w-[180px]">
                      <div className="text-[9px] text-text-secondary truncate">
                        {item.preset_icons.slice(0, 2).join(' ')} {item.match_reasons[0]}
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <ChevronRight size={12} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 flex items-center justify-between" style={{ background: 'rgba(5,9,26,0.8)', borderTop: '1px solid #111d30' }}>
            <span className="text-[9px] text-muted">Showing {filtered.length} opportunities · Click to open full analysis</span>
          </div>
        </div>
      )}
    </div>
  )
}
