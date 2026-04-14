'use client'

import useSWR from 'swr'
import { swrFetcher } from '@/lib/api'
import { useState, useMemo } from 'react'
import type { OpportunitiesResponse, OpportunityItem, MarketSnapshot } from '@/lib/types'
import { OpportunityCard } from './OpportunityCard'
import {
  RefreshCw, Database, Zap, LayoutGrid, List,
  TrendingUp, TrendingDown, Activity, Target, AlertCircle, Minus,
} from 'lucide-react'

// ── Filter config ──────────────────────────────────────────────────

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
  { id: 'ALL',        label: 'All' },
  { id: 'INTRADAY',   label: 'Intraday' },
  { id: 'SWING',      label: 'Swing' },
  { id: 'POSITIONAL', label: 'Positional' },
]

const SIGNAL_FILTERS = [
  { id: 'ALL',        label: 'All Signals' },
  { id: 'strong_buy', label: 'Strong Buy' },
  { id: 'buy',        label: 'Buy' },
  { id: 'hold',       label: 'Hold' },
]

const CONF_FILTERS = [
  { id: 'ALL',    label: 'All' },
  { id: 'HIGH',   label: 'High' },
  { id: 'MEDIUM', label: 'Medium' },
]

const REGION_FILTERS = [
  { id: 'all',   label: '🌍 All',   color: '#7c3aed' },
  { id: 'india', label: '🇮🇳 India', color: '#f97316' },
  { id: 'us',    label: '🇺🇸 US',   color: '#3b82f6' },
]

const SORT_OPTIONS = [
  { id: 'score',   label: 'Score ↓' },
  { id: 'change',  label: 'Change% ↓' },
  { id: 'rsi_asc', label: 'RSI ↑ (oversold)' },
  { id: 'rr',      label: 'Risk:Reward ↓' },
]

// ── Market Pulse Top Bar ────────────────────────────────────────────

// Shared IndexPill used in MarketPulseBar
function IndexPill({ q, label, flag }: { q: { price?: number | null; change_pct?: number | null } | undefined; label: string; flag: string }) {
  const price = q?.price ?? null
  const chg   = q?.change_pct ?? null
  const up    = chg !== null && chg > 0
  const dn    = chg !== null && chg < 0
  const clr   = up ? 'var(--bull)' : dn ? 'var(--bear)' : 'var(--t3)'
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[72px]">
      <div className="flex items-center gap-1">
        <span className="text-[13px] leading-none">{flag}</span>
        <span className="text-[11px] font-semibold" style={{ color: 'var(--t2)' }}>{label}</span>
      </div>
      <div className="flex items-center gap-1">
        {price != null ? (
          <span className="num text-[12px] font-bold" style={{ color: 'var(--t1)' }}>
            {price >= 10000
              ? price.toLocaleString('en-IN', { maximumFractionDigits: 0 })
              : price.toFixed(2)}
          </span>
        ) : <span className="text-[11px]" style={{ color: 'var(--t3)' }}>—</span>}
        {chg != null && (
          <span className="num text-[11px] font-bold flex items-center gap-0.5" style={{ color: clr }}>
            {up ? <TrendingUp size={9} /> : dn ? <TrendingDown size={9} /> : <Minus size={9} />}
            {up ? '+' : ''}{chg.toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  )
}

// Pure market-index bar — no regime/breadth, just 6 tickers centred symmetrically
function MarketPulseBar({ snapshot }: { snapshot: MarketSnapshot | undefined }) {
  const allQ = [
    ...(snapshot?.americas    ?? []),
    ...(snapshot?.emea        ?? []),
    ...(snapshot?.asia        ?? []),
    ...(snapshot?.india       ?? []),
    ...(snapshot?.safe_havens ?? []),
  ]
  const findQ = (sym: string) => allQ.find(q => q.symbol === sym)

  const EQUITY = [
    { sym: '^NSEI',  label: 'Nifty 50', flag: '🇮🇳' },
    { sym: '^BSESN', label: 'Sensex',   flag: '🇮🇳' },
    { sym: '^GSPC',  label: 'S&P 500',  flag: '🇺🇸' },
    { sym: '^IXIC',  label: 'Nasdaq',   flag: '🇺🇸' },
  ]
  const HAVENS = [
    { sym: '^VIX', label: 'VIX',  flag: '📊' },
    { sym: 'GC=F', label: 'Gold', flag: '🥇' },
  ]

  const Sep = () => <div className="w-px h-8 flex-shrink-0 mx-5" style={{ background: 'var(--border-default)' }} />

  return (
    <div className="rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
      {/* 1fr auto 1fr grid: left equity group | sep | right haven group, all centred as a unit */}
      <div className="flex items-center justify-center gap-5 px-6 py-3">
        {EQUITY.map(i => <IndexPill key={i.sym} q={findQ(i.sym)} label={i.label} flag={i.flag} />)}
        {HAVENS.map(i => <IndexPill key={i.sym} q={findQ(i.sym)} label={i.label} flag={i.flag} />)}
      </div>
    </div>
  )
}

// Regime + breadth header — sits above the pulse bar using the page's empty flanks
function RegimeBreadthHeader({ snapshot }: { snapshot: MarketSnapshot | undefined }) {
  const allQ = [
    ...(snapshot?.americas ?? []),
    ...(snapshot?.emea     ?? []),
    ...(snapshot?.asia     ?? []),
    ...(snapshot?.india    ?? []),
  ]
  const adv   = allQ.filter(q => (q.change_pct ?? 0) > 0).length
  const dec   = allQ.filter(q => (q.change_pct ?? 0) < 0).length
  const total = adv + dec

  const regime = snapshot?.risk_regime ?? 'neutral'
  const REGIME_MAP: Record<string, { label: string; color: string; bg: string }> = {
    'risk-on':    { label: 'Risk ON',    color: '#00d68f', bg: 'rgba(0,214,143,0.20)'   },
    'risk-off':   { label: 'Risk OFF',   color: '#f0384f', bg: 'rgba(240,56,79,0.20)'   },
    'transition': { label: 'Transition', color: '#f59e0b', bg: 'rgba(245,158,11,0.20)'  },
    'neutral':    { label: 'Neutral',    color: '#7dd3fc', bg: 'rgba(125,211,252,0.15)' },
  }
  const r = REGIME_MAP[regime] ?? REGIME_MAP.neutral

  // Breadth color: mostly up → bull, mostly down → bear, mixed → amber
  const breadthColor = total === 0 ? '#94a3b8'
    : adv / total >= 0.6 ? '#00d68f'
    : dec / total >= 0.6 ? '#f0384f'
    : '#f59e0b'
  const breadthBg    = total === 0 ? 'rgba(148,163,184,0.22)'
    : adv / total >= 0.6 ? 'rgba(0,214,143,0.22)'
    : dec / total >= 0.6 ? 'rgba(240,56,79,0.22)'
    : 'rgba(245,158,11,0.22)'
  const breadthLabel = total === 0 ? 'No data'
    : adv / total >= 0.6 ? 'Broad Rally'
    : dec / total >= 0.6 ? 'Broad Decline'
    : 'Mixed'

  return (
    /* 3-col grid: Regime left | Title centre | Breadth right */
    <div className="grid items-center mb-1" style={{ gridTemplateColumns: '1fr auto 1fr' }}>

      {/* LEFT — Regime: same coloring as Breadth (icon + label + badge all use r.color) */}
      <div className="flex items-center justify-start gap-2">
        <Activity size={13} style={{ color: r.color }} />
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: r.color }}>Regime</span>
        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md"
          style={{ color: r.color, background: r.bg, border: `1px solid ${r.color}70` }}>
          {r.label}
        </span>
      </div>

      {/* CENTRE — page title + subtitle */}
      <div className="flex flex-col items-center text-center px-6">
        <h1 className="flex items-center gap-2.5 text-[20px] font-bold leading-none" style={{ color: 'var(--t1)' }}>
          <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.4)' }}>
            <Target size={15} style={{ color: '#a78bfa' }} />
          </span>
          Investment &amp; Trading Opportunities
        </h1>
        <p className="text-[10px] mt-1.5 max-w-lg leading-relaxed" style={{ color: 'var(--t3)' }}>
          Multi-signal analysis · Nifty 50 + top US stocks · scored 0–100
        </p>
      </div>

      {/* RIGHT — Breadth: identical structure to Regime (icon → label → badge) */}
      <div className="flex items-center justify-end gap-2">
        <TrendingUp size={13} style={{ color: breadthColor }} />
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: breadthColor }}>Breadth</span>
        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md"
          style={{ color: breadthColor, background: breadthBg, border: `1px solid ${breadthColor}70` }}>
          {total > 0 ? `${adv}↑ · ${dec}↓` : breadthLabel}
        </span>
      </div>

    </div>
  )
}

// ── Filter group label + chips ─────────────────────────────────────

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-widest flex-shrink-0 opacity-70"
        style={{ color: 'var(--t2)' }}>
        {label}
      </span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  )
}

// ── Filter chip ────────────────────────────────────────────────────

function Chip({ active, onClick, color, children }: {
  active: boolean; onClick: () => void; color?: string; children: React.ReactNode
}) {
  const c = color || '#7c3aed'
  return (
    <button onClick={onClick}
      className="text-[12px] px-3 py-1 rounded-lg font-semibold transition-all whitespace-nowrap flex-shrink-0"
      style={{
        background:  active ? `${c}18` : 'transparent',
        color:       active ? c        : 'var(--t2)',
        border:      active ? `1px solid ${c}55` : '1px solid var(--border-default)',
        letterSpacing: '0.01em',
      }}>
      {children}
    </button>
  )
}

// ── Horizontal filter bar ──────────────────────────────────────────

function FilterBar({
  region, setRegion,
  horizonF, setHorizonF,
  signalF, setSignalF,
  confF, setConfF,
}: {
  region: string; setRegion: (v: string) => void
  horizonF: string; setHorizonF: (v: string) => void
  signalF: string; setSignalF: (v: string) => void
  confF: string; setConfF: (v: string) => void
}) {
  const hasActive = region !== 'all' || horizonF !== 'ALL' || signalF !== 'ALL' || confF !== 'ALL'
  return (
    <div className="rounded-xl overflow-x-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', scrollbarWidth: 'none' }}>
      <div className="flex items-center justify-center gap-2 px-4 py-2.5 min-w-max mx-auto">

        {/* Region */}
        <FilterGroup label="Region">
          {REGION_FILTERS.map(f => (
            <Chip key={f.id} active={region === f.id} onClick={() => setRegion(f.id)} color={f.color}>{f.label}</Chip>
          ))}
        </FilterGroup>

        <div className="w-px h-6 mx-2 flex-shrink-0" style={{ background: 'var(--border-default)' }} />

        {/* Horizon */}
        <FilterGroup label="Horizon">
          {HORIZON_FILTERS.map(f => (
            <Chip key={f.id} active={horizonF === f.id} onClick={() => setHorizonF(f.id)}>{f.label}</Chip>
          ))}
        </FilterGroup>

        <div className="w-px h-6 mx-2 flex-shrink-0" style={{ background: 'var(--border-default)' }} />

        {/* Signal */}
        <FilterGroup label="Signal">
          {SIGNAL_FILTERS.map(f => (
            <Chip key={f.id} active={signalF === f.id} onClick={() => setSignalF(f.id)} color="#00d68f">{f.label}</Chip>
          ))}
        </FilterGroup>

        <div className="w-px h-6 mx-2 flex-shrink-0" style={{ background: 'var(--border-default)' }} />

        {/* Confidence */}
        <FilterGroup label="Confidence">
          {CONF_FILTERS.map(f => (
            <Chip key={f.id} active={confF === f.id} onClick={() => setConfF(f.id)} color="#00d68f">{f.label}</Chip>
          ))}
        </FilterGroup>

        {hasActive && (
          <>
            <div className="w-px h-6 mx-2 flex-shrink-0" style={{ background: 'var(--border-default)' }} />
            <button
              onClick={() => { setRegion('all'); setHorizonF('ALL'); setSignalF('ALL'); setConfF('ALL') }}
              className="text-[11px] font-semibold transition-colors flex-shrink-0"
              style={{ color: 'var(--bear)' }}>
              ✕ Clear filters
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Stats bar ──────────────────────────────────────────────────────

function StatsBar({ data }: { data: OpportunitiesResponse }) {
  const items = [
    { label: 'Opportunities',   value: data.total_matched, color: '#7c3aed', icon: Target    },
    { label: 'High Confidence', value: data.high_conf,     color: '#00d68f', icon: Activity  },
    { label: 'Breakouts',       value: data.breakouts,     color: '#00d68f', icon: TrendingUp },
    { label: 'Reversals',       value: data.reversals,     color: '#4ade80', icon: TrendingDown },
    { label: 'Universe',        value: data.universe,      color: '#6b7c93', icon: Database   },
  ]
  return (
    <div className="grid grid-cols-5 gap-2.5">
      {items.map(({ label, value, color, icon: Icon }) => (
        <div key={label} className="rounded-xl px-4 py-3 flex flex-col items-center gap-1.5"
          style={{ background: `${color}08`, border: `1px solid ${color}25` }}>
          <Icon size={15} style={{ color }} />
          <div className="num text-[22px] font-bold leading-none" style={{ color }}>{value}</div>
          <div className="text-[11px] font-medium text-center" style={{ color: 'var(--t2)' }}>{label}</div>
        </div>
      ))}
    </div>
  )
}

// ── Empty / Seed state ─────────────────────────────────────────────

function SeedState({ onSeed, seeding }: { onSeed: () => void; seeding: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-6">
      <div className="w-28 h-28 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)' }}>
        <Database size={48} style={{ color: '#7c3aed' }} />
      </div>
      <div className="text-center max-w-lg">
        <div className="text-[18px] font-bold mb-2" style={{ color: 'var(--t1)' }}>Initialize the Analysis Engine</div>
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

// ── Main OpportunityHub ────────────────────────────────────────────

interface Props { defaultRegion?: string }

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
      case 'change':  return [...items].sort((a, b) => (b.change_pct ?? 0)  - (a.change_pct ?? 0))
      case 'rsi_asc': return [...items].sort((a, b) => (a.rsi_14 ?? 50)     - (b.rsi_14 ?? 50))
      case 'rr':      return [...items].sort((a, b) => (b.risk_reward ?? 0) - (a.risk_reward ?? 0))
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
    <div className="flex flex-col gap-3">

      {/* ── Header: Regime | Title | Breadth ───────────────────── */}
      <RegimeBreadthHeader snapshot={snapshot} />

      {/* ── Market pulse bar: pure indices, symmetric ──────────── */}
      <MarketPulseBar snapshot={snapshot} />

      {/* ── Filter bar (full-width, symmetric) ────────────────── */}
      <FilterBar
        region={region}   setRegion={setRegion}
        horizonF={horizonF} setHorizonF={setHorizonF}
        signalF={signalF}   setSignalF={setSignalF}
        confF={confF}       setConfF={setConfF}
      />

      {/* ── Type tabs + sort + view ────────────────────────────── */}
      <div className="flex items-center gap-3 rounded-xl px-4 py-2" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
        {/* Type chips — centred, scrollable */}
        <div className="flex gap-1.5 overflow-x-auto flex-1 justify-center" style={{ scrollbarWidth: 'none' }}>
          {TYPE_FILTERS.map(f => (
            <Chip key={f.id} active={typeF === f.id} onClick={() => setTypeF(f.id)} color={f.color}>
              {f.icon} {f.label}
            </Chip>
          ))}
        </div>

        {/* Controls — right-aligned, flex-shrink-0 */}
        <div className="flex items-center gap-2 flex-shrink-0 pl-2" style={{ borderLeft: '1px solid var(--border-default)' }}>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="text-[12px] px-2.5 py-1.5 rounded-lg outline-none cursor-pointer font-medium"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-default)', color: 'var(--t2)' }}>
            {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>

          <div className="flex p-0.5 rounded-lg gap-0.5" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-default)' }}>
            <button onClick={() => setView('grid')} title="Grid"
              className="p-1.5 rounded-md transition-all"
              style={{ background: view === 'grid' ? 'var(--bg-active)' : 'transparent', color: view === 'grid' ? 'var(--info)' : 'var(--t3)' }}>
              <LayoutGrid size={14} />
            </button>
            <button onClick={() => setView('row')} title="List"
              className="p-1.5 rounded-md transition-all"
              style={{ background: view === 'row' ? 'var(--bg-active)' : 'transparent', color: view === 'row' ? 'var(--info)' : 'var(--t3)' }}>
              <List size={14} />
            </button>
          </div>

          <button onClick={() => mutate()} disabled={isLoading}
            className="p-1.5 rounded-lg transition-all"
            title="Refresh"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-default)', color: 'var(--t2)' }}>
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Stats bar (5 equal columns) ───────────────────────── */}
      {data && !isLoading && <StatsBar data={data} />}

      {/* ── Content (full-width symmetric grid) ───────────────── */}
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
        <div className="rounded-xl overflow-hidden flex flex-col gap-0" style={{ border: '1px solid var(--border-default)' }}>
          {filtered.map((item, i) => (
            <div key={item.symbol} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border-dim)' : 'none' }}>
              <OpportunityCard item={item} view="row" />
            </div>
          ))}
        </div>
      )}

      {/* ── Footer ────────────────────────────────────────────── */}
      {hasData && !noMatches && (
        <div className="text-center text-[9px] text-muted py-2">
          Showing {filtered.length} of {data!.total_matched} opportunities · {data!.presets_run} scans run ·
          Refreshes every 5 min · <span style={{ color: 'var(--brand)' }}>Score ≥ 15</span>
        </div>
      )}
    </div>
  )
}
