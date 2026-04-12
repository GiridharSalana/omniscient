'use client'

import { useState, useCallback, useRef } from 'react'
import useSWR from 'swr'
import { swrFetcher, api } from '@/lib/api'
import { useRouter } from 'next/navigation'
import {
  Briefcase, Plus, Trash2, TrendingUp, TrendingDown, RefreshCw,
  Calculator, ChevronRight, AlertCircle, IndianRupee, DollarSign,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────
interface Holding {
  id: number; symbol: string; name: string | null; quantity: number
  avg_price: number; buy_date: string | null; notes: string | null; currency: string
  current_price: number | null; current_value: number | null; invested_value: number
  pnl: number | null; pnl_pct: number | null
  day_change: number | null; day_change_pct: number | null; created_at: string
}

interface Portfolio {
  total_invested: number; total_current: number; total_pnl: number
  total_pnl_pct: number; day_pnl: number; holdings_count: number
  holdings: Holding[]; sector_allocation: {symbol:string;value:number;pct:number}[]
  updated_at: string
}

// ── Helpers ───────────────────────────────────────────────────────
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

const fmt = (v: number | null | undefined, dec = 2) =>
  v == null ? '—' : v.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec })

const fmtCr = (v: number) => {
  const abs = Math.abs(v)
  if (abs >= 1e7) return `${(v/1e7).toFixed(2)} Cr`
  if (abs >= 1e5) return `${(v/1e5).toFixed(2)} L`
  return fmt(v)
}

// ── Mini allocation bar ───────────────────────────────────────────
function AllocationBar({ holdings, total }: { holdings: Holding[]; total: number }) {
  const colors = ['#6366f1','#00d68f','#f59e0b','#ff4d6d','#38bdf8','#a78bfa','#fb923c','#4ade80']
  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
        {holdings.slice(0, 8).map((h, i) => {
          const pct = ((h.current_value ?? h.invested_value) / Math.max(total, 1)) * 100
          return (
            <div key={h.id} title={`${h.symbol}: ${pct.toFixed(1)}%`}
              style={{ width: `${pct}%`, background: colors[i % colors.length], minWidth: 2 }} />
          )
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {holdings.slice(0, 8).map((h, i) => {
          const pct = ((h.current_value ?? h.invested_value) / Math.max(total, 1)) * 100
          return (
            <div key={h.id} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm" style={{ background: colors[i % colors.length] }} />
              <span className="text-[9px] text-muted">{h.symbol.replace('.NS','')}</span>
              <span className="text-[9px] text-text-secondary font-semibold">{pct.toFixed(1)}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Position Sizer ────────────────────────────────────────────────
function PositionSizer() {
  const [capital,   setCapital]   = useState('')
  const [riskPct,   setRiskPct]   = useState('1')
  const [entry,     setEntry]     = useState('')
  const [stop,      setStop]      = useState('')
  const [target,    setTarget]    = useState('')

  const cap  = parseFloat(capital)  || 0
  const risk = parseFloat(riskPct)  || 1
  const ent  = parseFloat(entry)    || 0
  const stp  = parseFloat(stop)     || 0
  const tgt  = parseFloat(target)   || 0

  const riskAmount  = cap * (risk / 100)
  const stopDist    = ent > 0 && stp > 0 ? Math.abs(ent - stp) : 0
  const shares      = stopDist > 0 ? Math.floor(riskAmount / stopDist) : 0
  const posSize     = shares * ent
  const rr          = (tgt > 0 && stopDist > 0) ? Math.abs(tgt - ent) / stopDist : 0
  const isValid     = cap > 0 && ent > 0 && stp > 0 && ent !== stp

  return (
    <div className="card space-y-4">
      <div className="section-header">
        <Calculator size={12} className="text-warn" />
        <span className="section-title">Position Sizer</span>
        <span className="text-[9px] text-muted ml-1">Risk-based calculator</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-[9px] text-muted uppercase tracking-wider block">Capital (₹)</label>
          <input type="number" className="input" placeholder="500000"
            value={capital} onChange={e => setCapital(e.target.value)} />

          <label className="text-[9px] text-muted uppercase tracking-wider block">Risk % per Trade</label>
          <div className="flex gap-1.5">
            {['0.5','1','1.5','2'].map(v => (
              <button key={v} onClick={() => setRiskPct(v)}
                className={cn('flex-1 py-1 rounded text-[10px] font-semibold transition-colors',
                  riskPct === v ? 'bg-warn/20 text-warn border border-warn/40' : 'bg-[#0f1f38] text-muted border border-[#1a2235]')}>
                {v}%
              </button>
            ))}
          </div>

          <label className="text-[9px] text-muted uppercase tracking-wider block">Entry Price</label>
          <input type="number" className="input" placeholder="1500.00"
            value={entry} onChange={e => setEntry(e.target.value)} />
        </div>

        <div className="space-y-2">
          <label className="text-[9px] text-muted uppercase tracking-wider block">Stop Loss</label>
          <input type="number" className="input" placeholder="1450.00"
            value={stop} onChange={e => setStop(e.target.value)} />

          <label className="text-[9px] text-muted uppercase tracking-wider block">Target (optional)</label>
          <input type="number" className="input" placeholder="1620.00"
            value={target} onChange={e => setTarget(e.target.value)} />
        </div>
      </div>

      {/* Results */}
      {isValid && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          {[
            { label: 'Shares to Buy',  value: shares.toLocaleString('en-IN'), color: '#a78bfa' },
            { label: 'Position Size',  value: `₹${fmtCr(posSize)}`,           color: '#38bdf8' },
            { label: 'Risk Amount',    value: `₹${fmtCr(riskAmount)}`,         color: '#ff4d6d' },
            { label: 'Risk:Reward',    value: rr > 0 ? `1:${rr.toFixed(1)}` : '—', color: rr >= 2 ? '#00d68f' : rr >= 1 ? '#fbbf24' : '#ff4d6d' },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center p-2.5 rounded-lg"
              style={{ background: `${color}0d`, border: `1px solid ${color}30` }}>
              <div className="text-[8px] text-muted uppercase tracking-wider mb-1">{label}</div>
              <div className="num text-[14px] font-bold" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {isValid && rr > 0 && (
        <p className="text-[9px] text-muted">
          {rr >= 2
            ? '✅ Good setup — Risk:Reward ≥ 2:1'
            : rr >= 1
            ? '⚠️ Borderline — consider a better entry or tighter stop'
            : '❌ Poor R:R — do not take this trade'}
        </p>
      )}
    </div>
  )
}

// ── Add holding form ──────────────────────────────────────────────
function AddHoldingForm({ onAdd, onCancel }: { onAdd: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ symbol: '', quantity: '', avg_price: '', buy_date: '', currency: 'INR' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const submit = async () => {
    if (!form.symbol || !form.quantity || !form.avg_price) {
      setError('Symbol, quantity and average price are required')
      return
    }
    setLoading(true)
    setError('')
    try {
      await fetch(`${API_BASE}/api/v1/portfolio/holdings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol:    form.symbol.toUpperCase(),
          quantity:  parseFloat(form.quantity),
          avg_price: parseFloat(form.avg_price),
          buy_date:  form.buy_date || undefined,
          currency:  form.currency,
        }),
      })
      onAdd()
    } catch (e: any) {
      setError(e.message || 'Failed to add holding')
    } finally {
      setLoading(false)
    }
  }

  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div className="card animate-fade-in space-y-3">
      <div className="section-header">
        <Plus size={11} className="text-brand" />
        <span className="section-title">Add Holding</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-[9px] text-muted uppercase tracking-wider block mb-1">Symbol *</label>
          <input className="input" placeholder="RELIANCE.NS / AAPL"
            value={form.symbol} onChange={e => f('symbol', e.target.value.toUpperCase())} />
          <p className="text-[8px] text-muted mt-0.5">Use .NS for NSE stocks</p>
        </div>
        <div>
          <label className="text-[9px] text-muted uppercase tracking-wider block mb-1">Quantity *</label>
          <input type="number" className="input" placeholder="100"
            value={form.quantity} onChange={e => f('quantity', e.target.value)} />
        </div>
        <div>
          <label className="text-[9px] text-muted uppercase tracking-wider block mb-1">Avg Buy Price *</label>
          <input type="number" className="input" placeholder="1500.00"
            value={form.avg_price} onChange={e => f('avg_price', e.target.value)} />
        </div>
        <div>
          <label className="text-[9px] text-muted uppercase tracking-wider block mb-1">Buy Date</label>
          <input type="date" className="input" value={form.buy_date}
            onChange={e => f('buy_date', e.target.value)} />
        </div>
        <div>
          <label className="text-[9px] text-muted uppercase tracking-wider block mb-1">Currency</label>
          <div className="flex gap-1">
            {['INR','USD'].map(c => (
              <button key={c} onClick={() => f('currency', c)}
                className={cn('flex-1 py-1 rounded text-[10px] font-semibold transition-colors border',
                  form.currency === c
                    ? 'bg-brand/20 text-brand border-brand/40'
                    : 'bg-[#0f1f38] text-muted border-[#1a2235]')}>
                {c === 'INR' ? '₹ INR' : '$ USD'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-[10px] text-bear">
          <AlertCircle size={11} />{error}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={submit} disabled={loading} className="btn btn-primary gap-1.5">
          {loading ? <RefreshCw size={11} className="animate-spin" /> : <Plus size={11} />}
          Add to Portfolio
        </button>
        <button onClick={onCancel} className="btn btn-ghost">Cancel</button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────
export default function PortfolioPage() {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)

  const { data, isLoading, mutate, error } = useSWR<Portfolio>(
    '/api/v1/portfolio/',
    swrFetcher,
    { refreshInterval: 60_000 },
  )

  const migrate = useCallback(async () => {
    await fetch(`${API_BASE}/api/v1/portfolio/migrate`, { method: 'POST' })
    mutate()
  }, [mutate])

  const deleteHolding = useCallback(async (id: number) => {
    if (!confirm('Remove this holding?')) return
    await fetch(`${API_BASE}/api/v1/portfolio/holdings/${id}`, { method: 'DELETE' })
    mutate()
  }, [mutate])

  const isTableMissing = (error as any)?.message?.includes('does not exist') ||
                          (error as any)?.message?.includes('42P01')

  if (isTableMissing) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-4 min-h-64">
        <Briefcase size={32} className="text-brand" />
        <div className="text-center">
          <div className="text-[14px] font-bold text-text-primary">Portfolio table not set up yet</div>
          <p className="text-[11px] text-muted mt-1">Click below to create the portfolio database table</p>
        </div>
        <button onClick={migrate} className="btn btn-primary gap-1.5">
          <Plus size={12} /> Initialize Portfolio
        </button>
      </div>
    )
  }

  const portfolio = data
  const isUp = (portfolio?.total_pnl ?? 0) >= 0
  const isDayUp = (portfolio?.day_pnl ?? 0) >= 0

  return (
    <div className="p-3 space-y-3 animate-fade-in">

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-[16px] font-bold text-text-primary">
            <Briefcase size={15} className="text-brand" />
            Portfolio
          </h1>
          <p className="text-[10px] text-muted mt-0.5">Track your holdings, P&amp;L, and risk</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => mutate()} className="btn btn-ghost text-[10px] gap-1">
            <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={() => setShowAdd(v => !v)} className="btn btn-primary gap-1.5 text-[11px]">
            <Plus size={11} /> Add Holding
          </button>
        </div>
      </div>

      {/* ── Add form ──────────────────────────────────────────────── */}
      {showAdd && (
        <AddHoldingForm
          onAdd={() => { setShowAdd(false); mutate() }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* ── Summary cards ─────────────────────────────────────────── */}
      {portfolio && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            {
              label: 'Total Invested',
              value: `₹${fmtCr(portfolio.total_invested)}`,
              color: '#8da3bf',
              sub:   `${portfolio.holdings_count} holdings`,
            },
            {
              label: 'Current Value',
              value: portfolio.total_current > 0 ? `₹${fmtCr(portfolio.total_current)}` : '—',
              color: '#38bdf8',
              sub:   'Live prices',
            },
            {
              label: 'Total P&L',
              value: portfolio.total_current > 0
                ? `${isUp ? '+' : ''}₹${fmtCr(portfolio.total_pnl)}`
                : '—',
              color: portfolio.total_current > 0 ? (isUp ? '#00d68f' : '#ff4d6d') : '#4b5d73',
              sub:   portfolio.total_current > 0
                ? `${isUp ? '+' : ''}${portfolio.total_pnl_pct.toFixed(2)}% overall`
                : 'Add prices',
            },
            {
              label: "Today's P&L",
              value: `${isDayUp ? '+' : ''}₹${fmtCr(portfolio.day_pnl)}`,
              color: isDayUp ? '#00d68f' : '#ff4d6d',
              sub:   'Day change',
            },
          ].map(({ label, value, color, sub }) => (
            <div key={label} className="card text-center py-3">
              <div className="text-[9px] text-muted uppercase tracking-wider mb-1.5">{label}</div>
              <div className="num text-[16px] font-bold leading-none" style={{ color }}>{value}</div>
              <div className="text-[8px] text-muted mt-1">{sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Allocation bar ────────────────────────────────────────── */}
      {portfolio && portfolio.holdings.length > 0 && (
        <div className="card space-y-2">
          <div className="section-header">
            <span className="section-title">Allocation</span>
          </div>
          <AllocationBar
            holdings={portfolio.holdings}
            total={portfolio.total_current || portfolio.total_invested}
          />
        </div>
      )}

      {/* ── Holdings table ────────────────────────────────────────── */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1a2235] flex items-center justify-between"
          style={{ background: 'rgba(10,22,40,0.8)' }}>
          <div className="flex items-center gap-2">
            <Briefcase size={11} className="text-brand" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Holdings</span>
            {portfolio && <span className="text-[9px] text-muted">{portfolio.holdings.length} positions</span>}
          </div>
        </div>

        {isLoading ? (
          <div className="p-3 space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 rounded animate-pulse" style={{ background: '#0f1f38' }} />
            ))}
          </div>
        ) : !portfolio?.holdings?.length ? (
          <div className="py-16 text-center space-y-3">
            <Briefcase size={28} className="mx-auto text-muted" />
            <div className="text-[13px] font-semibold text-text-secondary">No holdings yet</div>
            <p className="text-[10px] text-muted max-w-xs mx-auto">
              Add your first stock holding to start tracking your portfolio P&amp;L and allocation.
            </p>
            <button onClick={() => setShowAdd(true)} className="btn btn-primary gap-1.5 text-[11px] mx-auto">
              <Plus size={11} /> Add Your First Holding
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid #1a2235', background: 'rgba(10,22,40,0.6)' }}>
                  {['Symbol', 'Qty', 'Avg Price', 'CMP', 'Invested', 'Current', 'P&L', 'P&L %', 'Day %', ''].map(h => (
                    <th key={h} className="text-[9px] text-muted uppercase tracking-wider px-3 py-2 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {portfolio.holdings.map(h => {
                  const up    = (h.pnl ?? 0) >= 0
                  const dayUp = (h.day_change_pct ?? 0) >= 0
                  return (
                    <tr key={h.id}
                      className="border-b border-[#1a2235] hover:bg-[#0f1f38] transition-colors group">

                      <td className="px-3 py-2.5">
                        <Link href={`/stock/${h.symbol}`}
                          className="font-bold text-brand text-[11px] hover:underline block">
                          {h.symbol}
                        </Link>
                        {h.name && (
                          <span className="text-[8px] text-muted block truncate max-w-[100px]">{h.name}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 num text-[11px] text-text-secondary">{fmt(h.quantity,0)}</td>
                      <td className="px-3 py-2.5 num text-[11px] text-text-secondary">{fmt(h.avg_price)}</td>
                      <td className="px-3 py-2.5 num text-[11px] text-text-primary font-semibold">
                        {h.current_price != null ? fmt(h.current_price) : '—'}
                      </td>
                      <td className="px-3 py-2.5 num text-[10px] text-muted">{fmt(h.invested_value)}</td>
                      <td className="px-3 py-2.5 num text-[11px] text-text-primary">
                        {h.current_value != null ? fmt(h.current_value) : '—'}
                      </td>
                      <td className="px-3 py-2.5 num text-[11px] font-bold"
                        style={{ color: h.pnl != null ? (up ? '#00d68f' : '#ff4d6d') : '#4b5d73' }}>
                        {h.pnl != null ? `${up ? '+' : ''}${fmt(h.pnl)}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 num text-[11px] font-bold"
                        style={{ color: h.pnl_pct != null ? (up ? '#00d68f' : '#ff4d6d') : '#4b5d73' }}>
                        {h.pnl_pct != null ? `${up ? '+' : ''}${h.pnl_pct.toFixed(2)}%` : '—'}
                      </td>
                      <td className="px-3 py-2.5 num text-[10px] font-semibold"
                        style={{ color: h.day_change_pct != null ? (dayUp ? '#00d68f' : '#ff4d6d') : '#4b5d73' }}>
                        {h.day_change_pct != null ? `${dayUp ? '+' : ''}${h.day_change_pct.toFixed(2)}%` : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => deleteHolding(h.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-bear">
                          <Trash2 size={11} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Position Sizer ────────────────────────────────────────── */}
      <PositionSizer />

    </div>
  )
}
