'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { swrFetcher } from '@/lib/api'
import { Bell, BellOff, Plus, X, Trash2, CheckCircle, Clock, TrendingUp, TrendingDown, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

interface Alert {
  id:          number
  symbol:      string | null
  alert_type:  string
  threshold:   number | null
  condition:   Record<string, any>
  is_active:   boolean
  message:     string | null
  triggered_at: string | null
  created_at:  string
}

const ALERT_TYPES = [
  { id: 'price_above',      label: 'Price Above',       icon: TrendingUp,   needsSymbol: true,  needsThresh: true,  desc: 'Fires when price rises above a level' },
  { id: 'price_below',      label: 'Price Below',       icon: TrendingDown, needsSymbol: true,  needsThresh: true,  desc: 'Fires when price falls below a level' },
  { id: 'price_change_pct', label: 'Big % Move',        icon: Activity,     needsSymbol: true,  needsThresh: true,  desc: 'Fires on any large % move (e.g. 3%)' },
  { id: 'vix_spike',        label: 'VIX Spike',         icon: Activity,     needsSymbol: false, needsThresh: true,  desc: 'VIX rises above 30 or spikes 15%' },
  { id: 'cross_asset',      label: 'Risk-Off Signal',   icon: Activity,     needsSymbol: false, needsThresh: false, desc: 'Gold + USD both rising (risk-off)' },
  { id: 'sentiment_shift',  label: 'Regime Shift',      icon: Activity,     needsSymbol: false, needsThresh: false, desc: 'Market regime changes' },
]

const TYPE_COLORS: Record<string, string> = {
  price_above:      '#00d68f',
  price_below:      '#ff4d6d',
  price_change_pct: '#fbbf24',
  vix_spike:        '#ff4d6d',
  cross_asset:      '#38bdf8',
  sentiment_shift:  '#a78bfa',
}

function AlertCard({ alert, onDelete }: { alert: Alert; onDelete: () => void }) {
  const typeInfo  = ALERT_TYPES.find(t => t.id === alert.alert_type)
  const color     = TYPE_COLORS[alert.alert_type] ?? '#8da3bf'
  const triggered = !!alert.triggered_at

  return (
    <div className={cn('card space-y-2 transition-all', triggered && 'opacity-60')}
      style={{ borderLeft: `2px solid ${color}`, background: `linear-gradient(145deg,#0a1628,#0c1c34)` }}>

      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {alert.symbol && (
              <span className="num text-[11px] font-bold text-text-primary">{alert.symbol}</span>
            )}
            <span className="badge text-[8px]" style={{ color, borderColor: `${color}40`, background: `${color}12` }}>
              {typeInfo?.label ?? alert.alert_type}
            </span>
            {triggered ? (
              <span className="badge badge-bear text-[8px]"><CheckCircle size={8} /> Triggered</span>
            ) : (
              <span className="badge badge-bull text-[8px]"><Bell size={8} /> Active</span>
            )}
          </div>

          {alert.threshold != null && (
            <p className="text-[9px] text-muted mt-0.5">
              Threshold: <span className="num text-text-secondary">{alert.threshold}</span>
            </p>
          )}
          {alert.message && (
            <p className="text-[10px] text-text-secondary mt-1 leading-snug">{alert.message}</p>
          )}
          {alert.triggered_at && (
            <p className="text-[8px] text-muted mt-0.5">
              Triggered: {new Date(alert.triggered_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
            </p>
          )}
        </div>

        <button onClick={onDelete} className="text-muted hover:text-bear transition-colors flex-shrink-0 mt-0.5">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

function CreateAlertForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [type,      setType]      = useState('price_above')
  const [symbol,    setSymbol]    = useState('')
  const [threshold, setThreshold] = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  const typeInfo = ALERT_TYPES.find(t => t.id === type)!

  const submit = async () => {
    if (typeInfo.needsSymbol && !symbol) { setError('Symbol required'); return }
    if (typeInfo.needsThresh && !threshold) { setError('Threshold required'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/v1/alerts/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol:     typeInfo.needsSymbol ? symbol.toUpperCase() : null,
          alert_type: type,
          threshold:  typeInfo.needsThresh ? parseFloat(threshold) : null,
          condition:  {},
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      onCreated()
    } catch (e: any) {
      setError(e.message || 'Failed to create alert')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card animate-fade-in space-y-4"
      style={{ border: '1px solid rgba(99,102,241,0.3)', background: 'linear-gradient(145deg,#0d1a30,#0a1628)' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={13} className="text-brand" />
          <span className="text-[12px] font-bold text-text-primary">Create Alert</span>
        </div>
        <button onClick={onClose} className="text-muted hover:text-text-primary"><X size={14} /></button>
      </div>

      {/* Alert type picker */}
      <div>
        <label className="text-[9px] text-muted uppercase tracking-wider block mb-2">Alert Type</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {ALERT_TYPES.map(t => {
            const color = TYPE_COLORS[t.id]
            return (
              <button key={t.id} onClick={() => setType(t.id)}
                className={cn('text-left p-2.5 rounded-lg border transition-all',
                  type === t.id
                    ? 'border-opacity-60'
                    : '')}
                style={type === t.id
                  ? { borderColor: color, background: `${color}10` }
                  : { borderColor: 'var(--border-default)', background: 'var(--bg-raised)' }}>
                <div className="text-[10px] font-semibold" style={{ color: type === t.id ? color : '#8da3bf' }}>
                  {t.label}
                </div>
                <div className="text-[8px] text-muted mt-0.5 leading-tight">{t.desc}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Conditional fields */}
      <div className="grid grid-cols-2 gap-3">
        {typeInfo.needsSymbol && (
          <div>
            <label className="text-[9px] text-muted uppercase tracking-wider block mb-1">Symbol</label>
            <input className="input" placeholder="AAPL / RELIANCE.NS"
              value={symbol} onChange={e => setSymbol(e.target.value)} />
          </div>
        )}
        {typeInfo.needsThresh && (
          <div>
            <label className="text-[9px] text-muted uppercase tracking-wider block mb-1">
              {type === 'price_change_pct' ? 'Move % (e.g. 3)' : type === 'vix_spike' ? 'VIX Level' : 'Price Level'}
            </label>
            <input type="number" step="0.01" className="input"
              placeholder={type === 'price_change_pct' ? '3' : type === 'vix_spike' ? '25' : '150.00'}
              value={threshold} onChange={e => setThreshold(e.target.value)} />
          </div>
        )}
      </div>

      {error && <p className="text-[10px] text-bear">{error}</p>}

      <div className="flex gap-2">
        <button onClick={submit} disabled={loading} className="btn btn-primary gap-1.5">
          {loading ? <Clock size={11} className="animate-pulse" /> : <Bell size={11} />}
          Set Alert
        </button>
        <button onClick={onClose} className="btn btn-ghost">Cancel</button>
      </div>
    </div>
  )
}

export default function AlertsPage() {
  const [showCreate, setShowCreate] = useState(false)

  const { data: active,    mutate: mutateActive }    = useSWR<Alert[]>('/api/v1/alerts/?active_only=true',  swrFetcher, { refreshInterval: 30_000 })
  const { data: triggered, mutate: mutateTriggered } = useSWR<Alert[]>('/api/v1/alerts/triggered?limit=20', swrFetcher, { refreshInterval: 30_000 })

  const deleteAlert = async (id: number) => {
    await fetch(`${API_BASE}/api/v1/alerts/${id}`, { method: 'DELETE' })
    mutateActive()
    mutateTriggered()
  }

  const onCreated = () => {
    setShowCreate(false)
    mutateActive()
  }

  const checkNow = async () => {
    await fetch(`${API_BASE}/api/v1/alerts/check`, { method: 'POST' })
    mutateActive()
    mutateTriggered()
  }

  return (
    <div className="p-3 space-y-4 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-[16px] font-bold text-text-primary">
            <Bell size={15} className="text-warn" />
            Smart Alerts
          </h1>
          <p className="text-[10px] text-muted mt-0.5">Price levels · % moves · VIX spikes · Regime shifts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={checkNow} className="btn btn-ghost text-[10px] gap-1">
            <Activity size={11} /> Check Now
          </button>
          <button onClick={() => setShowCreate(v => !v)} className="btn btn-primary gap-1.5 text-[11px]">
            <Plus size={11} /> New Alert
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <CreateAlertForm onClose={() => setShowCreate(false)} onCreated={onCreated} />
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Active',    value: active?.length ?? 0,    color: '#00d68f', icon: Bell },
          { label: 'Triggered', value: triggered?.length ?? 0, color: '#ff4d6d', icon: CheckCircle },
          { label: 'Types',     value: ALERT_TYPES.length,     color: '#818cf8', icon: Activity },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="card text-center py-3">
            <Icon size={13} className="mx-auto mb-1" style={{ color }} />
            <div className="num text-[18px] font-bold" style={{ color }}>{value}</div>
            <div className="text-[8px] text-muted uppercase tracking-wider mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Active alerts */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Bell size={11} className="text-bull" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Active Alerts</span>
          <span className="badge badge-bull text-[8px]">{active?.length ?? 0}</span>
        </div>

        {!active?.length ? (
          <div className="card text-center py-8 space-y-3">
            <BellOff size={24} className="mx-auto text-muted" />
            <div>
              <p className="text-[12px] font-semibold text-text-secondary">No active alerts</p>
              <p className="text-[10px] text-muted mt-0.5">Set price or event alerts to get notified</p>
            </div>
            <button onClick={() => setShowCreate(true)} className="btn btn-primary gap-1.5 mx-auto text-[11px]">
              <Plus size={11} /> Create Your First Alert
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {active.map((a, idx) => {
              const isOrphan = active.length % 2 === 1 && idx === active.length - 1
              return (
                <div key={a.id} className={isOrphan ? 'sm:col-span-2' : ''}>
                  <AlertCard alert={a} onDelete={() => deleteAlert(a.id)} />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Triggered alerts */}
      {triggered && triggered.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <CheckCircle size={11} className="text-bear" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Recently Triggered</span>
            <span className="badge badge-bear text-[8px]">{triggered.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {triggered.map((a, idx) => {
              const isOrphan = triggered.length % 2 === 1 && idx === triggered.length - 1
              return (
                <div key={a.id} className={isOrphan ? 'sm:col-span-2' : ''}>
                  <AlertCard alert={a} onDelete={() => deleteAlert(a.id)} />
                </div>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}
