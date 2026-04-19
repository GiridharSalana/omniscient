'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { Settings, Globe, Star, Check, Loader2, Save } from 'lucide-react'
import { cn } from '@/lib/utils'

const MARKET_OPTIONS = [
  { id: 'india',    label: 'India',         flag: '🇮🇳', desc: 'NSE · BSE · NIFTY · SENSEX' },
  { id: 'americas', label: 'Americas',      flag: '🇺🇸', desc: 'NYSE · NASDAQ · S&P500' },
  { id: 'emea',     label: 'Europe',        flag: '🇪🇺', desc: 'FTSE · DAX · CAC40' },
  { id: 'asia',     label: 'Asia Pacific',  flag: '🌏', desc: 'Nikkei · Hang Seng · ASX' },
  { id: 'global',   label: 'Global/Macro',  flag: '🌍', desc: 'Gold · Oil · Bonds · FX' },
]

const HOME_REGION_OPTIONS = [
  { id: 'india',    label: 'India',    flag: '🇮🇳' },
  { id: 'americas', label: 'Americas', flag: '🇺🇸' },
  { id: 'emea',     label: 'Europe',   flag: '🇪🇺' },
  { id: 'asia',     label: 'Asia',     flag: '🌏' },
]

interface Prefs {
  markets:     string[]
  watchlist:   string[]
  home_region: string
  theme:       string
}

export default function SettingsPage() {
  const { user } = useAuth()
  const router   = useRouter()

  const [prefs,    setPrefs]    = useState<Prefs>({ markets: ['india','americas','emea','asia'], watchlist: [], home_region: 'india', theme: 'dark' })
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [migrated, setMigrated] = useState(false)

  useEffect(() => {
    if (!user) { router.push('/login'); return }
    api.users.preferences()
      .then((data: any) => setPrefs(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user])

  const toggleMarket = (id: string) => {
    setPrefs(p => ({
      ...p,
      markets: p.markets.includes(id) ? p.markets.filter(m => m !== id) : [...p.markets, id],
    }))
    setSaved(false)
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.users.updatePrefs(prefs)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch { }
    finally { setSaving(false) }
  }

  const runMigration = async () => {
    try {
      await api.init.migrateV2()
      setMigrated(true)
    } catch (e: any) {
      alert('Migration: ' + e.message)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-brand" />
    </div>
  )

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4 animate-fade-in">
      {/* Header */}
      <div className="grid items-center" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
        <div />
        <div className="flex items-center gap-2">
          <Settings size={16} className="text-brand" />
          <h1 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Settings & Preferences</h1>
        </div>
        <div className="flex justify-end">
          <button onClick={save} disabled={saving} className="btn btn-primary gap-1.5">
            {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} /> : <Save size={12} />}
            {saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Profile */}
      {user && (
        <div className="card">
          <div className="section-header">
            <Star size={12} className="text-warn" />
            <span className="section-title">Account</span>
          </div>
          <div className="flex items-center gap-4 py-2">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                 style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="text-[12px] font-semibold text-text-primary">{user.username}</div>
              <div className="text-[10px] text-muted">{user.email}</div>
            </div>
          </div>
        </div>
      )}

      {/* Home Region */}
      <div className="card">
        <div className="section-header">
          <Globe size={12} className="text-brand" />
          <span className="section-title">Home Region</span>
          <span className="text-[10px] text-muted ml-1">Your primary market — shown first on dashboard</span>
        </div>
        <div className="grid grid-cols-4 gap-2 py-1">
          {HOME_REGION_OPTIONS.map(opt => (
            <button key={opt.id} onClick={() => { setPrefs(p => ({ ...p, home_region: opt.id })); setSaved(false) }}
              className="py-2.5 px-3 rounded text-center transition-all"
              style={{
                background: prefs.home_region === opt.id ? 'var(--bg-active)' : 'var(--bg-raised)',
                border: `1px solid ${prefs.home_region === opt.id ? 'var(--brand)' : 'var(--border-default)'}`,
              }}>
              <div className="text-2xl mb-1">{opt.flag}</div>
              <div className="text-[10px] font-medium" style={{ color: prefs.home_region === opt.id ? 'var(--nav-active)' : 'var(--t3)' }}>{opt.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Markets */}
      <div className="card">
        <div className="section-header">
          <Globe size={12} className="text-bull" />
          <span className="section-title">Markets to Track</span>
          <span className="text-[10px] text-muted ml-1">Selected markets appear on your dashboard</span>
        </div>
        <div className="space-y-2 py-1">
          {MARKET_OPTIONS.map(opt => {
            const active = prefs.markets.includes(opt.id)
            return (
              <button key={opt.id} onClick={() => toggleMarket(opt.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded transition-all"
                style={{
                  background: active ? 'var(--brand-dim)' : 'var(--bg-raised)',
                  border: `1px solid ${active ? 'rgba(124,58,237,0.4)' : 'var(--border-default)'}`,
                }}>
                <div className="text-xl flex-shrink-0">{opt.flag}</div>
                <div className="flex-1 text-left">
                  <div className="text-[11px] font-semibold text-text-primary">{opt.label}</div>
                  <div className="text-[10px] text-muted">{opt.desc}</div>
                </div>
                <div className={cn('w-4 h-4 rounded flex items-center justify-center flex-shrink-0',
                  active ? 'bg-brand' : 'border')} style={!active ? { borderColor: 'var(--border-default)' } : {}}>
                  {active && <Check size={10} className="text-white" />}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Admin */}
      <div className="card">
        <div className="section-header">
          <Settings size={12} className="text-muted" />
          <span className="section-title">System</span>
        </div>
        <div className="py-1 space-y-2">
          <div className="flex items-center justify-between py-1">
            <div>
              <div className="text-[11px] text-text-secondary">Run Database Migration v2</div>
              <div className="text-[10px] text-muted">Apply user auth tables + India indices</div>
            </div>
            <button onClick={runMigration} disabled={migrated}
              className={cn('btn text-[10px]', migrated ? 'btn-ghost' : 'btn-primary')}>
              {migrated ? '✓ Applied' : 'Run Migration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
