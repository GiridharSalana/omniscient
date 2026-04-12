import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { MomentumRegime, RiskRegime, Sentiment } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Number formatting ─────────────────────────────────────────────

export function formatPrice(val: number | null | undefined, decimals = 2): string {
  if (val == null) return '—'
  return val.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatChange(val: number | null | undefined, showSign = true): string {
  if (val == null) return '—'
  const sign = val >= 0 ? '+' : ''
  return `${showSign ? sign : ''}${val.toFixed(2)}`
}

export function formatPct(val: number | null | undefined): string {
  if (val == null) return '—'
  const sign = val >= 0 ? '+' : ''
  return `${sign}${val.toFixed(2)}%`
}

export function formatVolume(val: number | null | undefined): string {
  if (val == null) return '—'
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B`
  if (val >= 1_000_000)     return `${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000)         return `${(val / 1_000).toFixed(0)}K`
  return val.toString()
}

export function formatMomentum(val: number | null | undefined): string {
  if (val == null) return '—'
  return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`
}

// ── Color utilities ───────────────────────────────────────────────

export function changeColor(val: number | null | undefined): string {
  if (val == null) return 'text-text-secondary'
  return val > 0 ? 'text-bull' : val < 0 ? 'text-bear' : 'text-text-secondary'
}

export function changeBg(val: number | null | undefined): string {
  if (val == null) return 'bg-surface-raised'
  return val > 0 ? 'bg-bull/10' : val < 0 ? 'bg-bear/10' : 'bg-surface-raised'
}

export function sentimentColor(s: Sentiment | null | undefined): string {
  if (s === 'bullish') return 'text-bull'
  if (s === 'bearish') return 'text-bear'
  return 'text-muted'
}

export function sentimentBg(s: Sentiment | null | undefined): string {
  if (s === 'bullish') return 'sentiment-bg-bull border text-bull'
  if (s === 'bearish') return 'sentiment-bg-bear border text-bear'
  return 'sentiment-bg-neutral border text-warn'
}

export function regimeColor(r: RiskRegime): string {
  if (r === 'risk-on')    return 'text-bull'
  if (r === 'risk-off')   return 'text-bear'
  if (r === 'transition') return 'text-warn'
  return 'text-muted'
}

export function regimeBg(r: RiskRegime): string {
  if (r === 'risk-on')    return 'badge-bull'
  if (r === 'risk-off')   return 'badge-bear'
  if (r === 'transition') return 'badge-warn'
  return 'badge-neutral'
}

export function momentumRegimeColor(r: MomentumRegime | null | undefined): string {
  if (r === 'surging')  return 'text-bull'
  if (r === 'strong')   return 'text-bull'
  if (r === 'weak')     return 'text-bear'
  if (r === 'crashing') return 'text-bear'
  return 'text-warn'
}

export function momentumRegimeBg(r: MomentumRegime | null | undefined): string {
  if (r === 'surging')  return 'regime-surging badge'
  if (r === 'strong')   return 'regime-strong badge'
  if (r === 'weak')     return 'regime-weak badge'
  if (r === 'crashing') return 'regime-crashing badge'
  return 'regime-neutral badge'
}

export function impactColor(score: number | null | undefined): string {
  if (score == null) return 'text-muted'
  if (score >= 70)   return 'text-bear'
  if (score >= 40)   return 'text-warn'
  return 'text-muted'
}

// ── Date formatting ───────────────────────────────────────────────

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const now   = Date.now()
  const then  = new Date(iso).getTime()
  const diff  = now - then
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)

  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7)  return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
