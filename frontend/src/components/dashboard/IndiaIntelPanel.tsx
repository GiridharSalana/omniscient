'use client'

import useSWR from 'swr'
import { swrFetcher } from '@/lib/api'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Activity, Layers } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────
interface PCRData {
  nifty_pcr:       number | null
  banknifty_pcr:   number | null
  nifty_signal:    string
  banknifty_signal: string
  nifty_call_oi:   number | null
  nifty_put_oi:    number | null
  max_pain:        number | null
  resistance:      number | null
  support:         number | null
  source:          string
}

interface FIIDIIRow { date: string; fii_net: number; dii_net: number; combined: number }
interface FIIDIIData {
  today:     FIIDIIRow | null
  history:   FIIDIIRow[]
  fii_signal: string
  source:    string
}

// ── Helpers ───────────────────────────────────────────────────────
const fmtCr = (v: number) => {
  const abs = Math.abs(v)
  if (abs >= 1e7) return `${(v / 1e7).toFixed(0)}Cr`
  if (abs >= 1e5) return `${(v / 1e5).toFixed(0)}L`
  return v.toFixed(0)
}

const SIGNAL_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  bullish:          { label: 'Bullish',    color: '#00d68f', bg: 'rgba(0,214,143,0.1)'  },
  slightly_bullish: { label: 'Sl. Bull',   color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
  neutral:          { label: 'Neutral',    color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
  slightly_bearish: { label: 'Sl. Bear',   color: '#fb923c', bg: 'rgba(251,146,60,0.1)' },
  bearish:          { label: 'Bearish',    color: '#ff4d6d', bg: 'rgba(255,77,109,0.1)' },
  strongly_bullish: { label: 'Strong Bull',color: '#00d68f', bg: 'rgba(0,214,143,0.15)' },
  supported:        { label: 'Supported',  color: '#38bdf8', bg: 'rgba(56,189,248,0.1)' },
  cautious:         { label: 'Cautious',   color: '#fb923c', bg: 'rgba(251,146,60,0.1)' },
  strongly_bearish: { label: 'Strong Bear',color: '#ff4d6d', bg: 'rgba(255,77,109,0.15)'},
  unavailable:      { label: 'N/A',        color: '#4b5d73', bg: 'rgba(75,93,115,0.1)'  },
}

function SignalPill({ signal }: { signal: string }) {
  const s = SIGNAL_STYLES[signal] ?? SIGNAL_STYLES.neutral
  return (
    <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}40` }}>
      {s.label}
    </span>
  )
}

// ── PCR Gauge ─────────────────────────────────────────────────────
function PCRGauge({ value, label, signal }: { value: number | null; label: string; signal: string }) {
  const clamped = Math.min(Math.max(value ?? 1, 0.3), 2)
  const pct  = ((clamped - 0.3) / 1.7) * 100  // 0.3 to 2.0 mapped to 0-100
  const s    = SIGNAL_STYLES[signal] ?? SIGNAL_STYLES.neutral

  return (
    <div className="text-center space-y-2">
      <div className="text-[8px] text-muted uppercase tracking-wider">{label}</div>

      {/* Semicircle gauge */}
      <div className="relative w-20 h-10 mx-auto overflow-hidden">
        <svg viewBox="0 0 80 40" className="w-20 h-10">
          {/* Background arc */}
          <path d="M 5 40 A 35 35 0 0 1 75 40" fill="none" stroke="#1a2235" strokeWidth="6" strokeLinecap="round" />
          {/* Colored fill — use stroke-dasharray trick */}
          <path d="M 5 40 A 35 35 0 0 1 75 40" fill="none"
            stroke={s.color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * 110} 110`} />
          {/* Needle */}
          <text x="40" y="36" textAnchor="middle" fontSize="10" fontWeight="700"
            fontFamily="JetBrains Mono, monospace" fill={value ? s.color : '#4b5d73'}>
            {value?.toFixed(2) ?? '—'}
          </text>
        </svg>
      </div>

      <SignalPill signal={signal} />
      <div className="flex justify-between text-[7px] text-muted px-1">
        <span>Bear 0.7</span><span>Neutral 1.0</span><span>Bull 1.2</span>
      </div>
    </div>
  )
}

// ── FII/DII Bar chart ─────────────────────────────────────────────
function FIIDIIChart({ history }: { history: FIIDIIRow[] }) {
  if (!history.length) return null
  const recent = history.slice(0, 7).reverse()
  const max    = Math.max(...recent.map(r => Math.abs(r.fii_net)), ...recent.map(r => Math.abs(r.dii_net)), 1)

  return (
    <div className="space-y-1.5">
      {recent.map((r) => {
        const fiiPct = (Math.abs(r.fii_net) / max) * 100
        const diiPct = (Math.abs(r.dii_net) / max) * 100
        const date   = r.date?.split('-').slice(1).join('/') ?? ''
        return (
          <div key={r.date} className="space-y-0.5">
            <div className="flex justify-between text-[7px] text-muted">
              <span>{date}</span>
              <span className={r.fii_net >= 0 ? 'text-bull' : 'text-bear'}>
                FII: {r.fii_net >= 0 ? '+' : ''}{fmtCr(r.fii_net)}
              </span>
              <span className={r.dii_net >= 0 ? 'text-bull' : 'text-bear'}>
                DII: {r.dii_net >= 0 ? '+' : ''}{fmtCr(r.dii_net)}
              </span>
            </div>
            <div className="flex gap-0.5 h-1.5 rounded-sm overflow-hidden">
              <div className="rounded-sm" style={{
                width: `${fiiPct}%`,
                background: r.fii_net >= 0 ? '#00d68f' : '#ff4d6d',
              }} />
              <div className="rounded-sm ml-0.5" style={{
                width: `${diiPct}%`,
                background: r.dii_net >= 0 ? '#38bdf8' : '#fb923c',
              }} />
            </div>
          </div>
        )
      })}
      <div className="flex gap-3 text-[7px] text-muted pt-1">
        <span className="flex items-center gap-1"><span className="w-2 h-1 rounded bg-bull inline-block" />FII</span>
        <span className="flex items-center gap-1"><span className="w-2 h-1 rounded bg-info inline-block" />DII</span>
      </div>
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────
export function IndiaIntelPanel() {
  const { data: pcr,    isLoading: pcrLoading }    = useSWR<PCRData>('/api/v1/india/pcr',     swrFetcher, { refreshInterval: 600_000 })
  const { data: fiidii, isLoading: fiidiiLoading } = useSWR<FIIDIIData>('/api/v1/india/fii-dii', swrFetcher, { refreshInterval: 3_600_000 })

  const loading = pcrLoading || fiidiiLoading

  return (
    <div className="card space-y-3"
      style={{ borderLeft: '2px solid rgba(99,102,241,0.5)', background: 'linear-gradient(145deg,#0a1628,#0c1c34)' }}>

      {/* Header */}
      <div className="section-header" style={{ borderBottomColor: 'rgba(99,102,241,0.2)' }}>
        <Activity size={11} style={{ color: '#818cf8' }} />
        <span className="section-title" style={{ color: '#a5b4fc' }}>India Intelligence</span>
        <span className="text-[8px] text-muted ml-auto">PCR · FII/DII · Flows</span>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-6 rounded" style={{ background: '#0f1f38' }} />)}
        </div>
      ) : (
        <>
          {/* PCR Gauges */}
          {pcr?.source !== 'unavailable' ? (
            <div className="grid grid-cols-2 gap-2">
              <PCRGauge value={pcr?.nifty_pcr ?? null}    label="Nifty PCR"      signal={pcr?.nifty_signal ?? 'neutral'} />
              <PCRGauge value={pcr?.banknifty_pcr ?? null} label="BankNifty PCR" signal={pcr?.banknifty_signal ?? 'neutral'} />
            </div>
          ) : (
            <div className="text-center py-2 text-[9px] text-muted">
              PCR data temporarily unavailable (NSE rate limit)
            </div>
          )}

          {/* PCR levels */}
          {pcr && (pcr.max_pain || pcr.resistance || pcr.support) && (
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: 'Support', value: pcr.support,    color: '#00d68f' },
                { label: 'Max Pain', value: pcr.max_pain,  color: '#fbbf24' },
                { label: 'Resistance', value: pcr.resistance, color: '#ff4d6d' },
              ].map(({ label, value, color }) => value ? (
                <div key={label} className="text-center p-1.5 rounded" style={{ background: `${color}0d`, border: `1px solid ${color}25` }}>
                  <div className="text-[7px] text-muted uppercase">{label}</div>
                  <div className="num text-[11px] font-bold" style={{ color }}>{value.toLocaleString('en-IN')}</div>
                </div>
              ) : null)}
            </div>
          )}

          <hr style={{ borderColor: 'rgba(26,48,80,0.5)' }} />

          {/* FII/DII today */}
          {fiidii?.today && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Layers size={10} className="text-info" />
                  <span className="text-[9px] font-semibold text-text-secondary uppercase tracking-wider">FII/DII Today</span>
                </div>
                <SignalPill signal={fiidii.fii_signal} />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: 'FII Net',  value: fiidii.today.fii_net, color: fiidii.today.fii_net >= 0 ? '#00d68f' : '#ff4d6d' },
                  { label: 'DII Net',  value: fiidii.today.dii_net, color: fiidii.today.dii_net >= 0 ? '#38bdf8' : '#fb923c' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center p-2 rounded"
                    style={{ background: `${color}0d`, border: `1px solid ${color}25` }}>
                    <div className="text-[7px] text-muted uppercase tracking-wider">{label}</div>
                    <div className="num text-[12px] font-bold" style={{ color }}>
                      {value >= 0 ? '+' : ''}{fmtCr(value)} Cr
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FII/DII 7-day chart */}
          {fiidii?.history && fiidii.history.length > 1 && (
            <div className="space-y-1.5">
              <div className="text-[8px] text-muted uppercase tracking-wider">7-Day Flow History</div>
              <FIIDIIChart history={fiidii.history} />
            </div>
          )}

          {fiidii?.source === 'unavailable' && (
            <div className="text-center py-1 text-[9px] text-muted">
              FII/DII data updates after 5 PM IST
            </div>
          )}
        </>
      )}
    </div>
  )
}
