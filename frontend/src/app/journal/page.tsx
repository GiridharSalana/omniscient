'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { swrFetcher, api } from '@/lib/api'
import type { JournalEntry } from '@/lib/types'
import { cn, formatDate, formatPrice, formatPct, changeColor } from '@/lib/utils'
import { BookOpen, Plus, X, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Loader } from '@/components/shared/Loader'

const ACTIONS    = ['buy', 'sell', 'short', 'cover', 'watch']
const EMOTIONS   = ['confident', 'fearful', 'greedy', 'neutral', 'fomo', 'disciplined']
const STRATEGIES = ['momentum breakout', 'mean reversion', 'trend following', 'swing trade', 'value', 'scalp', 'other']

export default function JournalPage() {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState<Record<string,string>>({
    trade_date: new Date().toISOString().split('T')[0],
    action: 'buy',
  })
  const [submitting, setSubmitting] = useState(false)

  const { data, isLoading, mutate } = useSWR<JournalEntry[]>('/api/v1/journal/?limit=50', swrFetcher)
  const { data: stats } = useSWR('/api/v1/journal/stats/summary', swrFetcher)

  const submit = async () => {
    setSubmitting(true)
    try {
      await api.journal.create({
        trade_date:   form.trade_date,
        symbol:       form.symbol?.toUpperCase(),
        action:       form.action,
        quantity:     form.quantity ? Number(form.quantity) : undefined,
        price:        form.price    ? Number(form.price)    : undefined,
        strategy_tag: form.strategy_tag,
        rationale:    form.rationale,
        emotion:      form.emotion,
      })
      await mutate()
      setShowForm(false)
      setForm({ trade_date: new Date().toISOString().split('T')[0], action: 'buy' })
    } catch (e) {
      console.error(e)
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) return <Loader message="Loading journal..." />

  const entries = data ?? []

  const effectiveShowForm = showForm

  return (
    <div className="p-3 space-y-3 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="grid items-center" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
        <div />
        <div className="flex items-center gap-2">
          <BookOpen size={15} className="text-warn" />
          <h1 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Trading Journal</h1>
          <span className="text-[11px] text-muted">· {entries.length} entries</span>
        </div>
        <div className="flex justify-end">
          <button onClick={() => setShowForm(v => !v)} className="btn btn-primary gap-1.5">
            {effectiveShowForm && entries.length > 0 ? <X size={12} /> : <Plus size={12} />}
            {effectiveShowForm && entries.length > 0 ? 'Cancel' : '+ Log Trade'}
          </button>
        </div>
      </div>

      {/* ── Stats — 4 equal columns ──────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-4 gap-2">
          {[
            {
              label: 'Net P&L',
              value: `₹${(stats.net_pnl ?? 0).toFixed(2)}`,
              color: stats.closed_trades > 0 ? ((stats.net_pnl ?? 0) >= 0 ? 'var(--bull)' : 'var(--bear)') : 'var(--t3)',
              glow:  stats.closed_trades > 0 ? ((stats.net_pnl ?? 0) >= 0 ? 'var(--bull-glow)' : 'var(--bear-glow)') : 'transparent',
            },
            {
              label: 'Win Rate',
              value: stats.closed_trades > 0 ? `${stats.win_rate ?? 0}%` : '—',
              color: stats.closed_trades > 0 ? ((stats.win_rate ?? 0) >= 50 ? 'var(--bull)' : 'var(--bear)') : 'var(--t3)',
              glow:  'transparent',
            },
            { label: 'Closed',  value: String(stats.closed_trades ?? 0), color: 'var(--t1)', glow: 'transparent' },
            { label: 'Emotion', value: stats.most_common_emotion ?? '—', color: 'var(--warn)', glow: 'rgba(251,191,36,0.12)' },
          ].map(({ label, value, color, glow }) => (
            <div key={label} className="rounded-xl text-center py-3 px-2"
                 style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: glow !== 'transparent' ? `inset 0 0 20px ${glow}` : 'none' }}>
              <div className="text-[9px] uppercase tracking-widest mb-1.5 text-muted">{label}</div>
              <div className="text-[20px] font-bold num capitalize leading-none" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state onboarding ──────────────────────────── */}
      {entries.length === 0 && !effectiveShowForm && (
        <div className="rounded-xl text-center py-12 space-y-4"
             style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
          <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
               style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)' }}>
            <BookOpen size={26} style={{ color: '#fbbf24' }} />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-text-primary">Start your trading journal</p>
            <p className="text-[11px] mt-1.5 max-w-sm mx-auto leading-relaxed text-text-secondary">
              Track every trade — entry, exit, emotion, rationale.<br />Get AI-powered reviews of your decisions.
            </p>
          </div>
          <button onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[12px] font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#4338ca,#7c3aed)', boxShadow: '0 0 20px rgba(99,102,241,0.35)', border: '1px solid rgba(99,102,241,0.4)' }}>
            <Plus size={13} /> Log Your First Trade
          </button>
        </div>
      )}

      {/* ── New Trade Form ───────────────────────────────────── */}
      {effectiveShowForm && (
        <div className="card animate-fade-in">
          <div className="section-header">
            <Plus size={11} className="text-brand" />
            <span className="section-title">Log New Trade</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Left column */}
            <div className="space-y-2">
              <Field label="Symbol">
                <input className="input" placeholder="AAPL" value={form.symbol ?? ''}
                  onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))} />
              </Field>
              <Field label="Date">
                <input type="date" className="input" value={form.trade_date}
                  onChange={e => setForm(f => ({ ...f, trade_date: e.target.value }))} />
              </Field>
              <Field label="Action">
                <div className="flex gap-1 flex-wrap">
                  {ACTIONS.map(a => (
                    <button key={a} onClick={() => setForm(f => ({ ...f, action: a }))}
                      className={cn('btn text-[10px] px-2 py-0.5 capitalize',
                        form.action === a ? 'btn-primary' : 'btn-ghost')}>
                      {a}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Quantity">
                <input type="number" className="input" placeholder="100"
                  value={form.quantity ?? ''}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
              </Field>
              <Field label="Price">
                <input type="number" className="input" placeholder="150.00"
                  value={form.price ?? ''}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
              </Field>
            </div>

            {/* Right column — mirrored */}
            <div className="space-y-2">
              <Field label="Strategy">
                <div className="flex gap-1 flex-wrap">
                  {STRATEGIES.map(s => (
                    <button key={s} onClick={() => setForm(f => ({ ...f, strategy_tag: s }))}
                      className={cn('btn text-[10px] px-2 py-0.5 capitalize',
                        form.strategy_tag === s ? 'btn-primary' : 'btn-ghost')}>
                      {s}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Emotion">
                <div className="flex gap-1 flex-wrap">
                  {EMOTIONS.map(e => (
                    <button key={e} onClick={() => setForm(f => ({ ...f, emotion: e }))}
                      className={cn('btn text-[10px] px-2 py-0.5 capitalize',
                        form.emotion === e ? 'btn-primary' : 'btn-ghost')}>
                      {e}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Rationale">
                <textarea className="input resize-none" rows={3} placeholder="Why are you entering this trade?"
                  value={form.rationale ?? ''}
                  onChange={e => setForm(f => ({ ...f, rationale: e.target.value }))} />
              </Field>
            </div>
          </div>

          <div className="flex justify-center mt-2">
            <button onClick={submit} disabled={submitting || !form.symbol}
              className="btn btn-primary px-6">
              {submitting ? 'Logging...' : 'Log Trade'}
            </button>
          </div>
        </div>
      )}

      {/* ── Journal entries — 3 equal columns for density ───── */}
      {entries.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {entries.map((entry, idx) => {
            const total = entries.length
            const isOrphan = total % 3 === 1 && idx === total - 1
            return (
              <div key={entry.id} className={isOrphan ? 'col-start-2' : ''}>
                <JournalCard entry={entry} onUpdate={() => mutate()} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-muted uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

function JournalCard({ entry, onUpdate }: { entry: JournalEntry; onUpdate: () => void }) {
  const ActionIcon =
    entry.action === 'buy'   ? TrendingUp   :
    entry.action === 'sell'  ? TrendingDown :
    entry.action === 'short' ? TrendingDown : Minus

  const actionColor =
    entry.action === 'buy'   ? 'text-bull' :
    entry.action === 'sell'  ? 'text-bear' :
    entry.action === 'short' ? 'text-bear' : 'text-muted'

  return (
    <div className="card space-y-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="num text-[12px] font-bold text-text-primary">{entry.symbol}</span>
          <div className={cn('flex items-center gap-0.5 badge border text-[9px] px-1 py-px', actionColor,
            entry.action === 'buy' ? 'border-bull/30 bg-bull/5' : 'border-bear/30 bg-bear/5')}>
            <ActionIcon size={9} />
            <span className="uppercase">{entry.action}</span>
          </div>
          {entry.strategy_tag && (
            <span className="badge border border-[#1c2030] text-[8px] text-muted px-1 py-px capitalize">
              {entry.strategy_tag}
            </span>
          )}
        </div>
        <span className="text-[9px] text-muted">{formatDate(entry.trade_date)}</span>
      </div>

      {/* P&L + details inline */}
      <div className="flex items-center gap-2 text-[10px] flex-wrap">
        {entry.price && <span className="text-muted">Entry: <span className="num text-text-secondary">{formatPrice(entry.price)}</span></span>}
        {entry.exit_price && <span className="text-muted">Exit: <span className="num text-text-secondary">{formatPrice(entry.exit_price)}</span></span>}
        {entry.quantity && <span className="text-muted">×<span className="num text-text-secondary">{entry.quantity}</span></span>}
        {entry.emotion && <span className="text-warn capitalize">{entry.emotion}</span>}
        {entry.pnl != null && (
          <span className={cn('num font-semibold ml-auto', changeColor(entry.pnl))}>
            ${entry.pnl.toFixed(2)} {entry.pnl_percent != null && `(${formatPct(entry.pnl_percent)})`}
          </span>
        )}
      </div>

      {/* Rationale */}
      {entry.rationale && (
        <p className="text-[10px] text-text-secondary leading-snug italic line-clamp-2">"{entry.rationale}"</p>
      )}

      {/* AI Review */}
      {entry.ai_review && (
        <div className="border-t border-[#1c2030] pt-1">
          <p className="text-[10px] text-text-secondary leading-snug line-clamp-3">{entry.ai_review}</p>
        </div>
      )}
    </div>
  )
}
