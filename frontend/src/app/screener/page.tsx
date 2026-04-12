'use client'

import { useState, useCallback } from 'react'
import useSWR from 'swr'
import { swrFetcher } from '@/lib/api'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Filter, RefreshCw, ChevronRight, TrendingUp, TrendingDown,
  Database, Zap, AlertCircle, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────
interface ScreenerResult {
  symbol:            string
  name:              string | null
  price:             number | null
  change_pct:        number | null
  volume:            number | null
  volume_ratio:      number | null
  rsi_14:            number | null
  sma_20:            number | null
  sma_50:            number | null
  sma_200:           number | null
  trend_signal:      string
  rsi_signal:        string
  ma_cross:          string
  overall:           string
  pct_from_52w_high: number | null
  match_reason:      string
  data_source:       string
}

interface ScreenerResponse {
  preset:   string
  label:    string
  desc:     string
  icon:     string
  color:    string
  results:  ScreenerResult[]
  universe: number
  matched:  number
}

// ── Presets ───────────────────────────────────────────────────────
const PRESETS = [
  { id: 'momentum_breakout', label: 'Momentum Breakouts', desc: '1D ≥ 2%, vol ≥ 1.5×',     icon: '🚀', color: '#00d68f' },
  { id: 'oversold_bounce',   label: 'Oversold Bounce',   desc: 'RSI ≤ 35, above 200 SMA',  icon: '📈', color: '#4ade80' },
  { id: 'near_52w_high',     label: '52W Highs',         desc: 'Within 2% of 52-week high', icon: '🏔️', color: '#a78bfa' },
  { id: 'volume_surge',      label: 'Volume Surge',      desc: 'Vol ≥ 2.5× 20D average',   icon: '⚡', color: '#f59e0b' },
  { id: 'gap_up',            label: 'Gap Ups',           desc: 'Opened ≥ 1% above close',  icon: '⬆️', color: '#00d68f' },
  { id: 'gap_down',          label: 'Gap Downs',         desc: 'Opened ≥ 1% below close',  icon: '⬇️', color: '#ff4d6d' },
  { id: 'strong_trend',      label: 'Strong Uptrend',    desc: 'P > SMA20 > SMA50 > 200',  icon: '📊', color: '#3b82f6' },
  { id: 'golden_cross',      label: 'Golden Cross',      desc: 'SMA50 crossed above SMA200',icon: '✨', color: '#fbbf24' },
]

const REGIONS = [
  { id: 'all',   label: '🌍 All' },
  { id: 'india', label: '🇮🇳 India' },
  { id: 'us',    label: '🇺🇸 US' },
]

// ── Small reusable components ─────────────────────────────────────
function RsiBar({ rsi }: { rsi: number | null }) {
  if (rsi == null) return <span className="text-muted text-[9px]">—</span>
  const color = rsi <= 30 ? '#00d68f' : rsi >= 70 ? '#ff4d6d' : '#fbbf24'
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: '#1a2235' }}>
        <div style={{ width: `${Math.min(100, rsi)}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
      </div>
      <span className="num text-[10px] font-bold tabular-nums" style={{ color }}>{rsi.toFixed(0)}</span>
    </div>
  )
}

function VolBar({ ratio }: { ratio: number | null }) {
  if (ratio == null) return <span className="text-muted text-[9px]">—</span>
  const color = ratio >= 3 ? '#f59e0b' : ratio >= 2 ? '#fb923c' : '#4f46e5'
  const pct   = Math.min(100, (ratio / 5) * 100)
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-10 h-1.5 rounded-full overflow-hidden" style={{ background: '#1a2235' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color }} />
      </div>
      <span className="num text-[10px] font-semibold tabular-nums" style={{ color }}>{ratio.toFixed(1)}×</span>
    </div>
  )
}

function SignalBadge({ signal }: { signal: string }) {
  const cfg: Record<string, { label: string; color: string }> = {
    strong_buy:  { label: 'STRONG BUY',  color: '#00d68f' },
    buy:         { label: 'BUY',         color: '#4ade80' },
    hold:        { label: 'HOLD',        color: '#fbbf24' },
    sell:        { label: 'SELL',        color: '#fb923c' },
    strong_sell: { label: 'STRONG SELL', color: '#ff4d6d' },
  }
  const c = cfg[signal] ?? { label: signal?.toUpperCase() ?? '—', color: '#64748b' }
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
      style={{ color: c.color, background: `${c.color}18`, border: `1px solid ${c.color}40` }}>
      {c.label}
    </span>
  )
}

function TrendBadge({ trend }: { trend: string }) {
  const map: Record<string, { color: string; icon: React.ReactNode }> = {
    bullish: { color: '#00d68f', icon: <TrendingUp size={9} /> },
    bearish: { color: '#ff4d6d', icon: <TrendingDown size={9} /> },
    neutral: { color: '#fbbf24', icon: null },
  }
  const c = map[trend] ?? map.neutral
  return (
    <span className="flex items-center gap-1 text-[9px] font-semibold capitalize"
      style={{ color: c.color }}>
      {c.icon}{trend}
    </span>
  )
}

function PriceChange({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted text-[10px]">—</span>
  const up = pct >= 0
  return (
    <span className={cn('num text-[11px] font-bold flex items-center gap-0.5')}
      style={{ color: up ? '#00d68f' : '#ff4d6d' }}>
      {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
      {up ? '+' : ''}{pct.toFixed(2)}%
    </span>
  )
}

// ── Seeder prompt ─────────────────────────────────────────────────
function SeedPrompt({ onSeed, seeding }: { onSeed: () => void; seeding: boolean }) {
  return (
    <div className="text-center py-16 space-y-4">
      <div className="text-5xl">📊</div>
      <div className="text-[14px] font-bold text-text-primary">No price data yet</div>
      <p className="text-[11px] text-muted max-w-sm mx-auto">
        The screener needs historical price data to compute RSI, moving averages, and volume ratios.
        Seed the universe to fetch 6-month history for Nifty 50 + top US stocks.
      </p>
      <button onClick={onSeed} disabled={seeding}
        className="btn btn-primary text-[11px] mx-auto gap-2 px-4 py-2">
        {seeding ? (
          <><RefreshCw size={12} className="animate-spin" /> Seeding... (takes ~60s)</>
        ) : (
          <><Database size={12} /> Seed Screener Universe</>
        )}
      </button>
      <p className="text-[9px] text-muted">
        Fetches data from Yahoo Finance (free, no key needed). Run once, then screener works instantly.
      </p>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────
export default function ScreenerPage() {
  const router = useRouter()
  const [preset, setPreset]   = useState('momentum_breakout')
  const [region, setRegion]   = useState('all')
  const [seeding, setSeeding] = useState(false)

  const { data, isLoading, mutate, error } = useSWR<ScreenerResponse>(
    `/api/v1/screener/run?preset=${preset}&region=${region}`,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  )

  const activePreset = PRESETS.find(p => p.id === preset)

  const handleSeed = useCallback(async () => {
    setSeeding(true)
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/api/v1/screener/seed-universe?region=${region}`,
        { method: 'POST' }
      )
      await mutate()
    } catch { /* ignore */ }
    finally { setSeeding(false) }
  }, [region, mutate])

  const noData = !isLoading && data?.universe === 0

  return (
    <div className="p-3 space-y-3 animate-fade-in">

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-[16px] font-bold text-text-primary">
            <Filter size={15} className="text-brand" />
            Stock Screener
          </h1>
          <p className="text-[10px] text-muted mt-0.5">
            Find trade setups using technical filters ·
            {data ? ` ${data.universe} symbols with price data` : ' Loading universe…'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Region filter */}
          <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background: '#0f1f38', border: '1px solid #1a2235' }}>
            {REGIONS.map(r => (
              <button key={r.id} onClick={() => setRegion(r.id)}
                className="text-[10px] px-2.5 py-1 rounded font-medium transition-all"
                style={{
                  background: region === r.id ? '#1e3a5f' : 'transparent',
                  color: region === r.id ? '#93c5fd' : '#4b5d73',
                  border: `1px solid ${region === r.id ? '#3b82f6' : 'transparent'}`,
                }}>
                {r.label}
              </button>
            ))}
          </div>

          <button onClick={() => mutate()}
            className="btn btn-ghost text-[10px] gap-1 px-2 py-1">
            <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Preset grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-1.5">
        {PRESETS.map(p => (
          <button key={p.id} onClick={() => setPreset(p.id)}
            className="flex flex-col items-center text-center p-2.5 rounded-lg transition-all hover:scale-[1.03] active:scale-100"
            style={{
              background: preset === p.id ? `${p.color}15` : 'rgba(15,31,56,0.6)',
              border: `1px solid ${preset === p.id ? p.color + '80' : '#1a2235'}`,
              boxShadow: preset === p.id ? `0 0 14px ${p.color}18` : 'none',
            }}>
            <span className="text-xl mb-0.5 leading-none">{p.icon}</span>
            <span className="text-[9px] font-semibold leading-tight mt-0.5"
              style={{ color: preset === p.id ? p.color : '#8da3bf' }}>
              {p.label}
            </span>
            <span className="text-[8px] text-muted mt-0.5 hidden lg:block leading-tight">{p.desc}</span>
          </button>
        ))}
      </div>

      {/* ── Active scan banner ────────────────────────────────────── */}
      {activePreset && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg"
          style={{ background: `${activePreset.color}08`, border: `1px solid ${activePreset.color}30` }}>
          <span className="text-2xl leading-none">{activePreset.icon}</span>
          <div className="flex-1">
            <div className="text-[12px] font-bold" style={{ color: activePreset.color }}>
              {activePreset.label}
            </div>
            <div className="text-[10px] text-muted">{activePreset.desc}</div>
          </div>
          {!isLoading && data && (
            <div className="text-right flex-shrink-0">
              <div className="num text-[22px] font-bold text-text-primary leading-none">{data.matched}</div>
              <div className="text-[9px] text-muted">matches</div>
            </div>
          )}
        </div>
      )}

      {/* ── Results table ─────────────────────────────────────────── */}
      <div className="card p-0 overflow-hidden">

        {isLoading ? (
          <div className="p-2 space-y-1.5">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-9 rounded animate-pulse" style={{ background: '#0f1f38', animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
        ) : noData ? (
          <SeedPrompt onSeed={handleSeed} seeding={seeding} />
        ) : error ? (
          <div className="py-10 text-center space-y-2">
            <AlertCircle size={20} className="mx-auto text-bear" />
            <div className="text-[11px] text-text-secondary">Failed to load screener results</div>
            <button onClick={() => mutate()} className="btn btn-ghost text-[10px]">Retry</button>
          </div>
        ) : !data?.results?.length ? (
          <div className="py-14 text-center space-y-2">
            <div className="text-4xl">🔍</div>
            <div className="text-[12px] font-semibold text-text-secondary">No matches found</div>
            <p className="text-[10px] text-muted">
              Try a different preset or switch region. Run more data if universe is small.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid #1a2235', background: 'rgba(10,22,40,0.8)' }}>
                  {['#', 'Symbol', 'Price', '1D %', 'Vol Ratio', 'RSI', 'Trend', 'Signal', 'Why Matched'].map((h, i) => (
                    <th key={h} className={cn(
                      'text-[9px] text-muted uppercase tracking-wider px-3 py-2 font-medium',
                      i === 0 ? 'text-center w-8' : 'text-left',
                    )}>{h}</th>
                  ))}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {data.results.map((r, i) => (
                  <tr key={r.symbol}
                    onClick={() => router.push(`/stock/${r.symbol}`)}
                    className="border-b border-[#1a2235] hover:bg-[#0f1f38] transition-colors cursor-pointer group">

                    {/* # */}
                    <td className="px-3 py-2.5 text-center">
                      <span className="text-[9px] text-muted font-medium">{i + 1}</span>
                    </td>

                    {/* Symbol */}
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-brand text-[12px] group-hover:underline">{r.symbol}</div>
                      {r.name && (
                        <div className="text-[9px] text-muted truncate max-w-[110px]">{r.name}</div>
                      )}
                    </td>

                    {/* Price */}
                    <td className="px-3 py-2.5">
                      <span className="num text-[11px] text-text-primary font-semibold">
                        {r.price != null
                          ? r.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : '—'}
                      </span>
                    </td>

                    {/* 1D % */}
                    <td className="px-3 py-2.5">
                      <PriceChange pct={r.change_pct} />
                    </td>

                    {/* Volume ratio */}
                    <td className="px-3 py-2.5">
                      <VolBar ratio={r.volume_ratio} />
                    </td>

                    {/* RSI */}
                    <td className="px-3 py-2.5">
                      <RsiBar rsi={r.rsi_14} />
                    </td>

                    {/* Trend */}
                    <td className="px-3 py-2.5">
                      <TrendBadge trend={r.trend_signal} />
                    </td>

                    {/* Signal */}
                    <td className="px-3 py-2.5">
                      <SignalBadge signal={r.overall} />
                    </td>

                    {/* Match reason */}
                    <td className="px-3 py-2.5">
                      <span className="text-[9px] text-text-secondary">{r.match_reason}</span>
                      {r.data_source === 'live' && (
                        <span className="ml-1 text-[8px] text-warn">live</span>
                      )}
                    </td>

                    {/* Arrow */}
                    <td className="px-3 py-2.5">
                      <ChevronRight size={12} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Footer */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-[#1a2235]"
              style={{ background: 'rgba(10,22,40,0.6)' }}>
              <span className="text-[9px] text-muted">
                Showing {data.results.length} of {data.matched} matches · Universe: {data.universe} symbols
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-muted flex items-center gap-1">
                  <Zap size={9} className="text-warn" /> Click any row to open full chart + analysis
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Legend ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 text-[9px] text-muted px-1">
        <span>RSI: <span style={{ color: '#00d68f' }}>≤30 oversold</span> · <span style={{ color: '#ff4d6d' }}>≥70 overbought</span></span>
        <span>Vol Ratio: 1×=avg · 2×=high · 3×=surge</span>
        <span>Signal: composite of RSI + MA trend + MACD + volume</span>
        <span>BMO = Before Market Open · AMC = After Market Close</span>
      </div>
    </div>
  )
}
