'use client'

import useSWR from 'swr'
import { swrFetcher } from '@/lib/api'
import type { MacroSnapshot, MacroIndicator, YieldCurvePoint } from '@/lib/types'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Shield, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Yield Curve SVG ──────────────────────────────────────────────────
function YieldCurveChart({ points }: { points: YieldCurvePoint[] }) {
  if (!points.length) return null
  const W = 180; const H = 60; const PAD = 6
  const vals = points.map(p => p.yield_)
  const minV = Math.min(...vals) - 0.1
  const maxV = Math.max(...vals) + 0.1
  const range = maxV - minV || 1

  const toX = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2)
  const toY = (v: number) => H - PAD - ((v - minV) / range) * (H - PAD * 2)

  const pts = points.map((p, i) => `${toX(i).toFixed(1)},${toY(p.yield_).toFixed(1)}`)
  const polyline = pts.join(' ')
  const area = `${toX(0)},${H} ` + pts.join(' ') + ` ${toX(points.length - 1)},${H}`

  // Detect inversion
  const isInverted = points.length >= 2 && points[0].yield_ > points[points.length - 1].yield_
  const color = isInverted ? '#ff4d6d' : '#00d68f'

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] text-muted uppercase tracking-wider">Yield Curve</span>
        {isInverted ? (
          <span className="badge badge-bear text-[8px]">INVERTED ⚠</span>
        ) : (
          <span className="badge badge-bull text-[8px]">NORMAL</span>
        )}
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <linearGradient id="yc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(t => (
          <line key={t}
            x1={PAD} y1={PAD + t * (H - PAD * 2)}
            x2={W - PAD} y2={PAD + t * (H - PAD * 2)}
            stroke="var(--border-default)" strokeWidth="0.5" strokeDasharray="2 2"
          />
        ))}
        {/* Area fill */}
        <polygon points={area} fill="url(#yc-fill)" />
        {/* Line */}
        <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Points */}
        {points.map((p, i) => (
          <g key={p.label}>
            <circle cx={toX(i)} cy={toY(p.yield_)} r="2.5" fill={color} stroke="#050c1a" strokeWidth="1" />
            <text x={toX(i)} y={H - 1} textAnchor="middle" fill="#4b5d73" fontSize="7">{p.label}</text>
            <text x={toX(i)} y={toY(p.yield_) - 4} textAnchor="middle" fill={color} fontSize="7.5" fontWeight="600">{p.yield_.toFixed(2)}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

// ── Single macro indicator row ────────────────────────────────────────
function IndicatorRow({ ind }: { ind: MacroIndicator }) {
  const TrendIcon = ind.trend === 'up' ? TrendingUp : ind.trend === 'down' ? TrendingDown : Minus
  const trendColor = ind.trend === 'up' ? 'text-bull' : ind.trend === 'down' ? 'text-bear' : 'text-muted'

  // Signal pill styling
  const signalCfg = {
    bullish: { cls: 'bg-bull/15 text-bull border border-bull/30', dot: '#00d68f' },
    bearish: { cls: 'bg-bear/15 text-bear border border-bear/30', dot: '#ff4d6d' },
    neutral: { cls: 'bg-warn/10 text-warn border border-warn/20', dot: '#fbbf24' },
  }[ind.signal as string] ?? { cls: 'bg-warn/10 text-warn border border-warn/20', dot: '#fbbf24' }

  // For spreads shown in bps, multiply by 100
  const spreadKeys = ['t10y2y', 't10y3m', 'baa10y']
  const valueDisplay = spreadKeys.includes(ind.key) && ind.value !== null
    ? `${(ind.value * 100).toFixed(0)} bps`
    : ind.unit === '%' ? `${ind.value?.toFixed(2)}%`
    : ind.unit === '$/bbl' ? `$${ind.value?.toFixed(1)}`
    : ind.unit === '$B' ? `$${ind.value?.toFixed(0)}B`
    : ind.value !== null ? String(ind.value?.toFixed(2))
    : '—'

  const changeDisplay = ind.change !== null && ind.change !== undefined
    ? `${ind.change > 0 ? '+' : ''}${spreadKeys.includes(ind.key) ? (ind.change * 100).toFixed(0) + ' bps' : ind.change.toFixed(2)}`
    : null

  return (
    <div className="flex items-center gap-2 py-1 px-1.5 rounded transition-colors" style={{ ['--tw-bg' as any]: 'var(--bg-hover)' }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'} onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: signalCfg.dot, boxShadow: `0 0 4px ${signalCfg.dot}` }} />
      <span className="text-[10px] text-text-secondary flex-1 min-w-0 truncate">{ind.label}</span>
      <div className="flex items-center gap-2 flex-shrink-0">
        {changeDisplay && (
          <span className={cn('text-[9px] num', trendColor)}>{changeDisplay}</span>
        )}
        <span className={cn('text-[11px] font-bold num rounded px-1 py-px text-center min-w-[52px]', signalCfg.cls)}>
          {valueDisplay}
        </span>
      </div>
    </div>
  )
}

// ── Regime banner ─────────────────────────────────────────────────────
function RegimeBanner({ signal, reason }: { signal: string; reason: string }) {
  const cfg = {
    'risk-on':  { icon: Zap,           color: 'text-bull', bg: 'bg-bull/8 border-bull/20',   label: 'RISK-ON' },
    'risk-off': { icon: Shield,        color: 'text-bear', bg: 'bg-bear/8 border-bear/20',   label: 'RISK-OFF' },
    'caution':  { icon: AlertTriangle, color: 'text-warn', bg: 'bg-warn/8 border-warn/20',   label: 'CAUTION' },
  }[signal as string] ?? { icon: Minus, color: 'text-muted', bg: 'bg-surface-raised border-surface-border', label: signal.toUpperCase() }

  const Icon = cfg.icon
  return (
    <div className={cn('rounded border p-2 mb-2', cfg.bg)}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon size={11} className={cfg.color} />
        <span className={cn('text-[10px] font-bold tracking-wider', cfg.color)}>{cfg.label}</span>
        <span className="text-[9px] text-muted ml-auto">MACRO REGIME</span>
      </div>
      <p className="text-[9px] text-text-secondary leading-snug">{reason}</p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────
const KEY_INDICATORS = ['fed_funds', 'cpi_yoy', 'unemployment', 't10y2y', 'baa10y', 'vix', 'gdp_growth', 'dgs10']

export function MacroPanel() {
  const { data, isLoading } = useSWR<MacroSnapshot>('/api/v1/macro/snapshot', swrFetcher, {
    refreshInterval: 3_600_000,   // refresh hourly
  })

  if (isLoading || !data) {
    return (
      <div className="card space-y-2 animate-pulse">
        <div className="h-2.5 w-28 rounded mx-auto skeleton" />
        {[1,2,3,4,5,6].map(i => <div key={i} className="h-4 rounded skeleton" style={{ opacity: 1 - i * 0.1 }} />)}
      </div>
    )
  }

  const keyInds = KEY_INDICATORS
    .map(k => data.indicators.find(i => i.key === k))
    .filter(Boolean) as MacroIndicator[]

  return (
    <div className="card space-y-1">
      <div className="section-header">
        <span className="text-base">📊</span>
        <span className="section-title" style={{ color: '#a5b4fc' }}>Macro Intelligence</span>
        <span className="text-[9px] text-muted">FRED · {data.as_of}</span>
      </div>

      <RegimeBanner signal={data.regime_signal} reason={data.regime_reason} />

      {/* Key indicators */}
      <div className="space-y-px">
        {keyInds.map(ind => <IndicatorRow key={ind.key} ind={ind} />)}
      </div>

      {/* Yield Curve */}
      <div className="pt-1 mt-1" style={{ borderTop: '1px solid var(--border-default)' }}>
        <YieldCurveChart points={data.yield_curve} />
      </div>
    </div>
  )
}
