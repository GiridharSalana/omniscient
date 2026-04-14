'use client'

import useSWR from 'swr'
import { swrFetcher } from '@/lib/api'
import { useState, useMemo, useEffect } from 'react'
import type { OpportunitiesResponse, OpportunityItem, MarketSnapshot } from '@/lib/types'
import { OpportunityCard } from './OpportunityCard'
import {
  RefreshCw, Database, Zap, LayoutGrid, List,
  TrendingUp, TrendingDown, Activity, ChevronRight,
  Target, AlertCircle, Minus,
} from 'lucide-react'

// ── Filter config ─────────────────────────────────────────────────

const TYPE_FILTERS = [
  { id: 'ALL',          label: 'All',          icon: '🌐', color: '#7c3aed' },
  { id: 'BREAKOUT',     label: 'Breakouts',    icon: '🚀', color: '#00d68f' },
  { id: 'REVERSAL',     label: 'Reversals',    icon: '📈', color: '#4ade80' },
  { id: 'TREND',        label: 'Trend',        icon: '📊', color: '#3b82f6' },
  { id: 'GOLDEN_CROSS', label: 'Golden Cross', icon: '✨', color: '#fbbf24' },
  { id: 'VOLUME',       label: 'Volume',       icon: '⚡', color: '#f59e0b' },
  { id: 'SQUEEZE',      label: 'Squeeze',      icon: '🎯', color: '#a78bfa' },
]

const HORIZON_FILTERS = [
  { id: 'ALL',        label: 'All Horizons' },
  { id: 'INTRADAY',   label: 'Intraday' },
  { id: 'SWING',      label: 'Swing (days)' },
  { id: 'POSITIONAL', label: 'Positional' },
]

const SIGNAL_FILTERS = [
  { id: 'ALL',         label: 'All Signals' },
  { id: 'strong_buy',  label: 'Strong Buy' },
  { id: 'buy',         label: 'Buy' },
  { id: 'hold',        label: 'Hold' },
]

const CONF_FILTERS = [
  { id: 'ALL',    label: 'All' },
  { id: 'HIGH',   label: 'High' },
  { id: 'MEDIUM', label: 'Medium' },
]

const REGION_FILTERS = [
  { id: 'all',   label: '🌍 All', color: '#7c3aed' },
  { id: 'india', label: '🇮🇳 India', color: '#f97316' },
  { id: 'us',    label: '🇺🇸 US', color: '#3b82f6' },
]

const SORT_OPTIONS = [
  { id: 'score',   label: 'Score ↓' },
  { id: 'change',  label: 'Change% ↓' },
  { id: 'rsi_asc', label: 'RSI ↑ (oversold)' },
  { id: 'rr',      label: 'Risk:Reward ↓' },
]

// ── Market Pulse Sidebar ──────────────────────────────────────────

function MarketPulseSidebar({ snapshot }: { snapshot: MarketSnapshot | undefined }) {
  const all = [
    ...(snapshot?.americas ?? []),
    ...(snapshot?.emea ?? []),
    ...(snapshot?.asia ?? []),
    ...(snapshot?.india ?? []),
  ]
  const adv = all.filter(q => (q.change_pct ?? 0) > 0).length
  const dec = all.filter(q => (q.change_pct ?? 0) < 0).length
  const total = adv + dec

  const regime = snapshot?.risk_regime ?? 'neutral'
  const REGIME = {
    'risk-on':    { label: 'Risk ON',    color: '#00d68f', bg: 'rgba(0,214,143,0.1)'  },
    'risk-off':   { label: 'Risk OFF',   color: '#f0384f', bg: 'rgba(240,56,79,0.1)'  },
    'transition': { label: 'Transition', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
    'neutral':    { label: 'Neutral',    color: '#6b7c93', bg: 'rgba(107,124,147,0.1)'},
  }
  const r = REGIME[regime] ?? REGIME.neutral

  const KEY_INDICES = [
    { sym: '^NSEI',  label: 'Nifty 50', flag: '🇮🇳' },
    { sym: '^BSESN', label: 'Sensex',   flag: '🇮🇳' },
    { sym: '^GSPC',  label: 'S&P 500',  flag: '🇺🇸' },
    { sym: '^IXIC',  label: 'Nasdaq',   flag: '🇺🇸' },
    { sym: '^VIX',   label: 'VIX',      flag: '📊' },
    { sym: 'GC=F',   label: 'Gold',     flag: '🥇' },
  ]
  const findQ = (sym: string) => all.find(q => q.symbol === sym)

  return (
    <div className="flex flex-col gap-2">

      {/* Regime */}
      <div className="rounded-xl p-3" style={{ background: '#070f1d', border: '1px solid #1a2235' }}>
        <div className="flex items-center gap-1.5 mb-2">
          <Activity size={11} style={{ color: r.color }} />
          <span className="text-[9px] text-muted uppercase tracking-wider font-semibold">Market Regime</span>
        </div>
        <div className="text-[13px] font-bold px-3 py-1.5 rounded-lg text-center"
          style={{ color: r.color, background: r.bg, border: `1px solid ${r.color}40` }}>
          {r.label}
        </div>

        {/* Breadth */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1">
              <TrendingUp size={9} style={{ color: '#00d68f' }} />
              <span className="num text-[11px] font-bold" style={{ color: '#00d68f' }}>{adv}</span>
              <span className="text-[8px] text-muted">adv</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[8px] text-muted">dec</span>
              <span className="num text-[11px] font-bold" style={{ color: '#f0384f' }}>{dec}</span>
              <TrendingDown size={9} style={{ color: '#f0384f' }} />
            </div>
          </div>
          <div className="h-2 rounded-full bg-[#111d30] overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{
                width: total > 0 ? `${(adv / total) * 100}%` : '50%',
                background: 'linear-gradient(90deg, #00d68f, #05b87a)',
              }} />
          </div>
          <div className="text-center text-[8px] text-muted mt-1">
            {total > 0 ? `${((adv / total) * 100).toFixed(0)}% advancing` : 'No data'}
          </div>
        </div>
      </div>

      {/* Key Indices */}
      <div className="rounded-xl overflow-hidden" style={{ background: '#070f1d', border: '1px solid #1a2235' }}>
        <div className="px-3 py-2 border-b border-[#111d30]">
          <span className="text-[9px] text-muted uppercase tracking-wider font-semibold">Key Indices</span>
        </div>
        {KEY_INDICES.map(({ sym, label, flag }) => {
          const q = findQ(sym)
          const chg = q?.change_pct ?? null
          const price = q?.price ?? null
          const up = chg !== null && chg > 0
          const dn = chg !== null && chg < 0
          return (
            <div key={sym} className="flex items-center justify-between px-3 py-2 border-b border-[#0b1525] last:border-0 hover:bg-[#0a1525] transition-colors">
              <div className="flex items-center gap-1.5">
                <span className="text-xs">{flag}</span>
                <span className="text-[10px] text-text-secondary font-medium">{label}</span>
              </div>
              <div className="text-right">
                {price != null ? (
                  <>
                    <div className="num text-[10px] font-semibold text-text-primary leading-none">
                      {price >= 10000 ? price.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : price.toFixed(2)}
                    </div>
                    {chg != null && (
                      <div className="num text-[8px] font-bold leading-none mt-0.5 flex items-center justify-end gap-0.5"
                        style={{ color: up ? '#00d68f' : dn ? '#f0384f' : '#6b7c93' }}>
                        {up ? <TrendingUp size={7} /> : dn ? <TrendingDown size={7} /> : <Minus size={7} />}
                        {up ? '+' : ''}{chg.toFixed(2)}%
                      </div>
                    )}
                  </>
                ) : <span className="text-[8px] text-muted">—</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Stats bar ─────────────────────────────────────────────────────

function StatsBar({ data, filtered }: { data: OpportunitiesResponse; filtered: OpportunityItem[] }) {
  const statsItems = [
    { label: 'Opportunities', value: data.total_matched, color: '#7c3aed', icon: Target },
    { label: 'High Confidence', value: data.high_conf, color: '#00d68f', icon: Activity },
    { label: 'Breakouts', value: data.breakouts, color: '#00d68f', icon: TrendingUp },
    { label: 'Reversals', value: data.reversals, color: '#4ade80', icon: TrendingDown },
    { label: 'Universe', value: data.universe, color: '#6b7c93', icon: Database },
  ]
  return (
    <div className="grid grid-cols-5 gap-2">
      {statsItems.map(({ label, value, color, icon: Icon }) => (
        <div key={label} className="rounded-xl px-3 py-2.5 flex flex-col items-center gap-0.5"
          style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
          <Icon size={11} style={{ color }} />
          <div className="num text-[18px] font-bold leading-none" style={{ color }}>{value}</div>
          <div className="text-[8px] text-muted text-center leading-tight">{label}</div>
        </div>
      ))}
    </div>
  )
}

// ── Empty / Seed state ────────────────────────────────────────────

function SeedState({ onSeed, seeding }: { onSeed: () => void; seeding: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-6">
      <div className="w-28 h-28 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)' }}>
        <Database size={48} style={{ color: '#7c3aed' }} />
      </div>
      <div className="text-center max-w-lg">
        <div className="text-[18px] font-bold text-white mb-2">Initialize the Analysis Engine</div>
        <p className="text-[12px] text-text-secondary leading-relaxed">
          The system needs 6 months of historical price data to compute RSI, moving averages, Bollinger Bands,
          ATR, and all technical signals. This runs once and takes about 60 seconds.
        </p>
      </div>
      <button onClick={onSeed} disabled={seeding}
        className="btn btn-primary gap-2 px-8 py-3 text-[13px]">
        {seeding
          ? <><RefreshCw size={14} className="animate-spin" /> Seeding Nifty 50 + US Stocks…</>
          : <><Zap size={14} /> Initialize Stock Universe</>}
      </button>
      <p className="text-[9px] text-muted">Fetches from Yahoo Finance · Nifty 50 + 20 top US stocks</p>
    </div>
  )
}

// ── Filter chip ───────────────────────────────────────────────────

function FilterChip({ active, onClick, color, children }: {
  active: boolean; onClick: () => void; color?: string; children: React.ReactNode
}) {
  const c = color || '#7c3aed'
  return (
    <button onClick={onClick}
      className="text-[10px] px-2.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap flex-shrink-0"
      style={{
        background: active ? `${c}15` : 'transparent',
        color:      active ? c : '#4b5d73',
        border:     `1px solid ${active ? c + '60' : '#1a2235'}`,
      }}>
      {children}
    </button>
  )
}

// ── Main OpportunityHub ───────────────────────────────────────────

interface Props {
  defaultRegion?: string
}

export function OpportunityHub({ defaultRegion = 'all' }: Props) {
  const [region,   setRegion]   = useState(defaultRegion)
  const [typeF,    setTypeF]    = useState('ALL')
  const [horizonF, setHorizonF] = useState('ALL')
  const [signalF,  setSignalF]  = useState('ALL')
  const [confF,    setConfF]    = useState('ALL')
  const [sortBy,   setSortBy]   = useState('score')
  const [view,     setView]     = useState<'grid' | 'row'>('grid')
  const [seeding,  setSeeding]  = useState(false)

  const { data, isLoading, mutate, error } = useSWR<OpportunitiesResponse>(
    `/api/v1/screener/opportunities?region=${region}&min_score=15&limit=60`,
    swrFetcher,
    { refreshInterval: 300_000, revalidateOnFocus: false }
  )

  const { data: snapshot } = useSWR<MarketSnapshot>(
    '/api/v1/market/snapshot', swrFetcher, { refreshInterval: 60_000 }
  )

  const filtered = useMemo(() => {
    let items = data?.opportunities ?? []
    if (typeF    !== 'ALL') items = items.filter(o => o.opportunity_type === typeF)
    if (horizonF !== 'ALL') items = items.filter(o => o.time_horizon     === horizonF)
    if (signalF  !== 'ALL') items = items.filter(o => o.overall          === signalF)
    if (confF    !== 'ALL') items = items.filter(o => o.confidence       === confF)
    switch (sortBy) {
      case 'change':  return [...items].sort((a, b) => (b.change_pct ?? 0)   - (a.change_pct ?? 0))
      case 'rsi_asc': return [...items].sort((a, b) => (a.rsi_14 ?? 50)      - (b.rsi_14 ?? 50))
      case 'rr':      return [...items].sort((a, b) => (b.risk_reward ?? 0)   - (a.risk_reward ?? 0))
      default:        return items
    }
  }, [data, typeF, horizonF, signalF, confF, sortBy])

  const noData    = !isLoading && data?.universe === 0
  const hasData   = !!data && !isLoading && (data.universe > 0 || data.total_matched > 0)
  const noMatches = hasData && filtered.length === 0

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

  return (
    <div className="flex gap-4 items-start">

      {/* ── LEFT SIDEBAR ─────────────────────────────────────────── */}
      <div className="w-[220px] flex-shrink-0 flex flex-col gap-3 sticky top-[88px]">
        <MarketPulseSidebar snapshot={snapshot} />

        {/* Filters box */}
        <div className="rounded-xl overflow-hidden" style={{ background: '#070f1d', border: '1px solid #1a2235' }}>
          <div className="px-3 py-2 border-b border-[#111d30]">
            <span className="text-[9px] text-muted uppercase tracking-wider font-semibold">Filters</span>
          </div>

          {/* Region */}
          <div className="px-3 py-2 border-b border-[#0b1525]">
            <div className="text-[8px] text-muted mb-1.5 font-semibold uppercase tracking-wide">Region</div>
            <div className="flex flex-col gap-1">
              {REGION_FILTERS.map(f => (
                <button key={f.id} onClick={() => setRegion(f.id)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all text-left"
                  style={{
                    background: region === f.id ? `${f.color}15` : 'transparent',
                    color:      region === f.id ? f.color : '#4b5d73',
                    border:     `1px solid ${region === f.id ? f.color + '50' : 'transparent'}`,
                  }}>
                  {f.label}
                  {region === f.id && <ChevronRight size={9} className="ml-auto" />}
                </button>
              ))}
            </div>
          </div>

          {/* Horizon */}
          <div className="px-3 py-2 border-b border-[#0b1525]">
            <div className="text-[8px] text-muted mb-1.5 font-semibold uppercase tracking-wide">Time Horizon</div>
            <div className="flex flex-col gap-1">
              {HORIZON_FILTERS.map(f => (
                <button key={f.id} onClick={() => setHorizonF(f.id)}
                  className="flex items-center px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all text-left"
                  style={{
                    background: horizonF === f.id ? 'rgba(124,58,237,0.12)' : 'transparent',
                    color:      horizonF === f.id ? '#c4b5fd' : '#4b5d73',
                  }}>
                  {horizonF === f.id && <span className="mr-1.5 text-[8px]">›</span>}
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Signal */}
          <div className="px-3 py-2 border-b border-[#0b1525]">
            <div className="text-[8px] text-muted mb-1.5 font-semibold uppercase tracking-wide">Signal</div>
            <div className="flex flex-col gap-1">
              {SIGNAL_FILTERS.map(f => (
                <button key={f.id} onClick={() => setSignalF(f.id)}
                  className="flex items-center px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all text-left"
                  style={{
                    background: signalF === f.id ? 'rgba(0,214,143,0.08)' : 'transparent',
                    color:      signalF === f.id ? '#00d68f' : '#4b5d73',
                  }}>
                  {signalF === f.id && <span className="mr-1.5 text-[8px]">›</span>}
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Confidence */}
          <div className="px-3 py-2">
            <div className="text-[8px] text-muted mb-1.5 font-semibold uppercase tracking-wide">Confidence</div>
            <div className="flex flex-col gap-1">
              {CONF_FILTERS.map(f => (
                <button key={f.id} onClick={() => setConfF(f.id)}
                  className="flex items-center px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all text-left"
                  style={{
                    background: confF === f.id ? 'rgba(0,214,143,0.08)' : 'transparent',
                    color:      confF === f.id ? '#00d68f' : '#4b5d73',
                  }}>
                  {confF === f.id && <span className="mr-1.5 text-[8px]">›</span>}
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Reset filters */}
        {(typeF !== 'ALL' || horizonF !== 'ALL' || signalF !== 'ALL' || confF !== 'ALL') && (
          <button onClick={() => { setTypeF('ALL'); setHorizonF('ALL'); setSignalF('ALL'); setConfF('ALL') }}
            className="text-[9px] text-brand hover:underline text-center py-1">
            ✕ Clear all filters
          </button>
        )}
      </div>

      {/* ── MAIN FEED ────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">

        {/* Type filter tabs + sort + view */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 overflow-x-auto flex-1" style={{ scrollbarWidth: 'none' }}>
            {TYPE_FILTERS.map(f => (
              <FilterChip key={f.id} active={typeF === f.id} onClick={() => setTypeF(f.id)} color={f.color}>
                {f.icon} {f.label}
              </FilterChip>
            ))}
          </div>

          {/* Sort + View + Refresh */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="text-[9px] px-2 py-1.5 rounded-lg outline-none cursor-pointer"
              style={{ background: '#0b1729', border: '1px solid #1a2235', color: '#8da3bf' }}>
              {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>

            <div className="flex p-0.5 rounded-lg gap-0.5" style={{ background: '#070f1d', border: '1px solid #1a2235' }}>
              <button onClick={() => setView('grid')} title="Grid"
                className="p-1.5 rounded-md transition-colors"
                style={{ background: view === 'grid' ? '#1e3a5f' : 'transparent', color: view === 'grid' ? '#93c5fd' : '#4b5d73' }}>
                <LayoutGrid size={12} />
              </button>
              <button onClick={() => setView('row')} title="List"
                className="p-1.5 rounded-md transition-colors"
                style={{ background: view === 'row' ? '#1e3a5f' : 'transparent', color: view === 'row' ? '#93c5fd' : '#4b5d73' }}>
                <List size={12} />
              </button>
            </div>

            <button onClick={() => mutate()} disabled={isLoading}
              className="p-1.5 rounded-lg transition-colors"
              style={{ background: '#0b1729', border: '1px solid #1a2235', color: '#8da3bf' }}>
              <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Stats bar */}
        {data && !isLoading && <StatsBar data={data} filtered={filtered} />}

        {/* Content */}
        {isLoading ? (
          <div className={view === 'grid' ? 'grid grid-cols-3 gap-3' : 'flex flex-col gap-2'}>
            {[...Array(view === 'grid' ? 9 : 7)].map((_, i) => (
              <div key={i} className="skeleton rounded-xl"
                style={{ height: view === 'grid' ? 380 : 64, animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
        ) : noData ? (
          <SeedState onSeed={handleSeed} seeding={seeding} />
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-20">
            <AlertCircle size={28} className="text-bear" />
            <div className="text-[13px] text-text-secondary">Failed to load opportunities</div>
            <button onClick={() => mutate()} className="btn btn-ghost text-[11px]">Retry</button>
          </div>
        ) : noMatches ? (
          <div className="flex flex-col items-center gap-4 py-20">
            <div className="text-4xl">🔍</div>
            <div className="text-[14px] font-semibold text-text-secondary">No opportunities match these filters</div>
            <button
              onClick={() => { setTypeF('ALL'); setHorizonF('ALL'); setSignalF('ALL'); setConfF('ALL') }}
              className="btn btn-ghost text-[11px]">
              Clear filters
            </button>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-3 gap-3">
            {filtered.map(item => (
              <OpportunityCard key={item.symbol} item={item} view="card" />
            ))}
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden flex flex-col gap-0"
            style={{ border: '1px solid #1a2235' }}>
            {filtered.map((item, i) => (
              <div key={item.symbol} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #0b1525' : 'none' }}>
                <OpportunityCard item={item} view="row" />
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        {hasData && !noMatches && (
          <div className="text-center text-[9px] text-muted py-2">
            Showing {filtered.length} of {data!.total_matched} opportunities · {data!.presets_run} scans run ·
            Refreshes every 5 min ·
            <span style={{ color: '#7c3aed' }}> Score ≥ 15</span>
          </div>
        )}
      </div>
    </div>
  )
}
