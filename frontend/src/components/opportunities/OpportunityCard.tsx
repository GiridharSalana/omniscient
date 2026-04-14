'use client'

import { useRouter } from 'next/navigation'
import type { OpportunityItem } from '@/lib/types'
import { ArrowUpRight, ArrowDownRight, ExternalLink } from 'lucide-react'

// ── Sparkline SVG ─────────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null
  const W = 120, H = 40, PAD = 2
  const points = data.map((v, i) => ({
    x: PAD + (i / (data.length - 1)) * (W - 2 * PAD),
    y: PAD + (1 - v) * (H - 2 * PAD),
  }))
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${H} L ${points[0].x} ${H} Z`
  const id = `sp-${Math.random().toString(36).slice(2)}`

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${id})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y}
        r="2.5" fill={color} />
    </svg>
  )
}

// ── Type badge config ─────────────────────────────────────────────

const TYPE_CONFIG = {
  BREAKOUT:     { label: 'BREAKOUT',     color: '#00d68f', bg: 'rgba(0,214,143,0.12)',  icon: '🚀' },
  REVERSAL:     { label: 'REVERSAL',     color: '#4ade80', bg: 'rgba(74,222,128,0.12)', icon: '📈' },
  TREND:        { label: 'TREND',        color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', icon: '📊' },
  GOLDEN_CROSS: { label: 'GOLDEN CROSS', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', icon: '✨' },
  VOLUME:       { label: 'VOLUME SURGE', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '⚡' },
  SQUEEZE:      { label: 'SQUEEZE',      color: '#a78bfa', bg: 'rgba(167,139,250,0.12)',icon: '🎯' },
  SIGNAL:       { label: 'SIGNAL',       color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',  icon: '📡' },
} as const

const SIGNAL_CONFIG = {
  strong_buy:  { label: 'STRONG BUY',  color: '#00d68f', bg: 'rgba(0,214,143,0.15)'  },
  buy:         { label: 'BUY',         color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
  hold:        { label: 'HOLD',        color: '#fbbf24', bg: 'rgba(251,191,36,0.10)' },
  sell:        { label: 'SELL',        color: '#fb923c', bg: 'rgba(251,146,60,0.10)' },
  strong_sell: { label: 'STRONG SELL', color: '#f0384f', bg: 'rgba(240,56,79,0.15)'  },
} as const

const CONF_CONFIG = {
  HIGH:   { color: '#00d68f', dot: '●' },
  MEDIUM: { color: '#fbbf24', dot: '●' },
  LOW:    { color: '#6b7c93', dot: '●' },
}

const HORIZON_CONFIG = {
  INTRADAY:   { label: 'Intraday',   color: '#f59e0b' },
  SWING:      { label: 'Swing',      color: '#06b6d4' },
  POSITIONAL: { label: 'Positional', color: '#a78bfa' },
}

// ── Price formatting ──────────────────────────────────────────────

function fmtPrice(p: number | null): string {
  if (p == null) return '—'
  if (p >= 100000) return p.toLocaleString('en-IN', { maximumFractionDigits: 0 })
  if (p >= 10000)  return p.toLocaleString('en-IN', { maximumFractionDigits: 0 })
  if (p >= 1000)   return p.toLocaleString('en-IN', { maximumFractionDigits: 1 })
  return p.toFixed(2)
}

// ── Score bar ─────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? '#00d68f' : score >= 50 ? '#fbbf24' : '#f0384f'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-[#111d30]">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }} />
      </div>
      <span className="num text-[10px] font-bold flex-shrink-0 w-6 text-right" style={{ color }}>
        {score}
      </span>
    </div>
  )
}

// ── Entry/Stop/Target levels ──────────────────────────────────────

function PriceLevel({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[7px] uppercase tracking-wider font-semibold" style={{ color: `${color}80` }}>{label}</span>
      <span className="num text-[10px] font-bold leading-tight" style={{ color }}>
        {value != null ? fmtPrice(value) : '—'}
      </span>
    </div>
  )
}

// ── Main Card ─────────────────────────────────────────────────────

interface Props {
  item: OpportunityItem
  view?: 'card' | 'row'
}

export function OpportunityCard({ item, view = 'card' }: Props) {
  const router = useRouter()
  const up = (item.change_pct ?? 0) >= 0
  const typeCfg   = TYPE_CONFIG[item.opportunity_type] ?? TYPE_CONFIG.SIGNAL
  const signalCfg = SIGNAL_CONFIG[item.overall as keyof typeof SIGNAL_CONFIG] ?? SIGNAL_CONFIG.hold
  const confCfg   = CONF_CONFIG[item.confidence]
  const horizCfg  = HORIZON_CONFIG[item.time_horizon]
  const regionFlag = item.region === 'india' ? '🇮🇳' : item.region === 'us' ? '🇺🇸' : '🌐'
  const sparkColor = up ? '#00d68f' : '#f0384f'

  if (view === 'row') {
    return (
      <div onClick={() => router.push(`/stock/${item.symbol}`)}
        className="group flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all hover:bg-[#0b1729]"
        style={{ border: '1px solid #111d30' }}>

        {/* Score */}
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${typeCfg.color}15`, border: `1px solid ${typeCfg.color}40` }}>
          <span className="num text-[11px] font-bold" style={{ color: typeCfg.color }}>
            {item.opportunity_score}
          </span>
        </div>

        {/* Symbol */}
        <div className="w-32 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs">{regionFlag}</span>
            <span className="font-bold text-white text-[12px]">{item.symbol.replace('.NS', '')}</span>
          </div>
          {item.name && <div className="text-[8px] text-muted truncate max-w-[120px]">{item.name}</div>}
        </div>

        {/* Type + Signal */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded"
            style={{ color: typeCfg.color, background: typeCfg.bg }}>{typeCfg.icon} {typeCfg.label}</span>
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded"
            style={{ color: signalCfg.color, background: signalCfg.bg }}>{signalCfg.label}</span>
        </div>

        {/* Price + change */}
        <div className="flex items-baseline gap-2 flex-shrink-0">
          <span className="num text-[13px] font-bold text-white">{fmtPrice(item.price)}</span>
          {item.change_pct != null && (
            <span className="num text-[11px] font-bold flex items-center gap-0.5"
              style={{ color: up ? '#00d68f' : '#f0384f' }}>
              {up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
              {up ? '+' : ''}{item.change_pct.toFixed(2)}%
            </span>
          )}
        </div>

        {/* Sparkline */}
        <div className="flex-shrink-0">
          <Sparkline data={item.sparkline} color={sparkColor} />
        </div>

        {/* RSI + Volume */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {item.rsi_14 != null && (
            <div className="text-center">
              <div className="text-[7px] text-muted">RSI</div>
              <div className="num text-[10px] font-bold"
                style={{ color: item.rsi_14 <= 30 ? '#00d68f' : item.rsi_14 >= 70 ? '#f0384f' : '#fbbf24' }}>
                {item.rsi_14.toFixed(0)}
              </div>
            </div>
          )}
          {item.volume_ratio != null && (
            <div className="text-center">
              <div className="text-[7px] text-muted">Vol</div>
              <div className="num text-[10px] font-bold"
                style={{ color: item.volume_ratio >= 2 ? '#f59e0b' : '#6b7c93' }}>
                {item.volume_ratio.toFixed(1)}×
              </div>
            </div>
          )}
        </div>

        {/* Entry/Stop/Target */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <PriceLevel label="Entry" value={item.entry_price} color="#06b6d4" />
          <PriceLevel label="Stop"  value={item.stop_loss}   color="#f0384f" />
          <PriceLevel label="Target" value={item.target_price} color="#00d68f" />
        </div>

        {/* Why */}
        <div className="flex-1 min-w-0">
          <div className="text-[9px] text-text-secondary truncate">{item.why}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[7px]" style={{ color: confCfg.color }}>{confCfg.dot}</span>
            <span className="text-[8px]" style={{ color: confCfg.color }}>{item.confidence}</span>
            <span className="text-[7px] text-muted">·</span>
            <span className="text-[8px]" style={{ color: horizCfg.color }}>{horizCfg.label}</span>
          </div>
        </div>

        <ExternalLink size={11} className="text-muted opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
      </div>
    )
  }

  // ── CARD VIEW ─────────────────────────────────────────────────────
  return (
    <div onClick={() => router.push(`/stock/${item.symbol}`)}
      className="group relative rounded-xl cursor-pointer flex flex-col overflow-hidden transition-all duration-200"
      style={{
        background: 'linear-gradient(160deg, #080f1f 0%, #050912 100%)',
        border: `1px solid ${typeCfg.color}28`,
        boxShadow: `0 4px 24px rgba(0,0,0,0.5)`,
      }}>

      {/* Top accent + hover glow */}
      <div className="h-0.5 w-full flex-shrink-0"
        style={{ background: `linear-gradient(90deg, transparent, ${typeCfg.color}, transparent)` }} />
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-xl"
        style={{ background: `radial-gradient(ellipse at 50% -10%, ${typeCfg.color}10 0%, transparent 60%)`,
                 border: `1px solid ${typeCfg.color}50` }} />

      <div className="flex flex-col gap-2.5 p-3.5 flex-1 relative">

        {/* Row 1: Symbol + Type + Score */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-sm leading-none">{regionFlag}</span>
              <span className="font-bold text-white text-[15px] leading-none tracking-tight">
                {item.symbol.replace('.NS', '')}
              </span>
              {item.bb_squeeze && (
                <span className="text-[7px] px-1 py-0.5 rounded font-bold flex-shrink-0"
                  style={{ color: '#a78bfa', background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)' }}>
                  SQUEEZE
                </span>
              )}
              {item.ma_cross === 'golden_cross' && (
                <span className="text-[7px] px-1 py-0.5 rounded font-bold flex-shrink-0"
                  style={{ color: '#fbbf24', background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)' }}>
                  GX
                </span>
              )}
            </div>
            {item.name && (
              <div className="text-[8px] text-muted truncate leading-tight">{item.name}</div>
            )}
          </div>

          {/* Score circle */}
          <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center relative"
            style={{ border: `2px solid ${typeCfg.color}60`, background: `${typeCfg.color}10` }}>
            <span className="num text-[11px] font-bold" style={{ color: typeCfg.color }}>
              {item.opportunity_score}
            </span>
          </div>
        </div>

        {/* Row 2: Type + Signal badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
            style={{ color: typeCfg.color, background: typeCfg.bg, border: `1px solid ${typeCfg.color}40` }}>
            {typeCfg.icon} {typeCfg.label}
          </span>
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
            style={{ color: signalCfg.color, background: signalCfg.bg, border: `1px solid ${signalCfg.color}40` }}>
            {signalCfg.label}
          </span>
          <span className="text-[7px] px-1 py-0.5 rounded ml-auto"
            style={{ color: horizCfg.color, background: `${horizCfg.color}10` }}>
            {horizCfg.label}
          </span>
        </div>

        {/* Row 3: Price + Change */}
        <div className="flex items-baseline gap-2">
          <span className="num text-[20px] font-bold leading-none text-white">
            {fmtPrice(item.price)}
          </span>
          {item.change_pct != null && (
            <span className="num text-[12px] font-bold flex items-center gap-0.5"
              style={{ color: up ? '#00d68f' : '#f0384f' }}>
              {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {up ? '+' : ''}{item.change_pct.toFixed(2)}%
            </span>
          )}
        </div>

        {/* Row 4: Sparkline */}
        {item.sparkline.length >= 2 && (
          <div className="overflow-hidden rounded-md -mx-0.5">
            <Sparkline data={item.sparkline} color={sparkColor} />
          </div>
        )}

        {/* Row 5: RSI + Volume indicators */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[8px] text-muted">RSI-14</span>
              {item.rsi_14 != null && (
                <span className="num text-[9px] font-bold"
                  style={{ color: item.rsi_14 <= 30 ? '#00d68f' : item.rsi_14 >= 70 ? '#f0384f' : '#fbbf24' }}>
                  {item.rsi_14.toFixed(0)}
                </span>
              )}
            </div>
            <div className="h-1 rounded-full bg-[#111d30] overflow-hidden">
              {item.rsi_14 != null && (
                <div className="h-full rounded-full"
                  style={{
                    width: `${item.rsi_14}%`,
                    background: item.rsi_14 <= 30 ? '#00d68f' : item.rsi_14 >= 70 ? '#f0384f' : '#fbbf24',
                  }} />
              )}
            </div>
            <div className="text-[7px] mt-0.5"
              style={{ color: item.rsi_14 != null && item.rsi_14 <= 30 ? '#00d68f' : item.rsi_14 != null && item.rsi_14 >= 70 ? '#f0384f' : '#6b7c93' }}>
              {item.rsi_14 != null && item.rsi_14 <= 30 ? 'Oversold ↑' : item.rsi_14 != null && item.rsi_14 >= 70 ? 'Overbought ↓' : 'Neutral'}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[8px] text-muted">Volume</span>
              {item.volume_ratio != null && (
                <span className="num text-[9px] font-bold"
                  style={{ color: item.volume_ratio >= 2.5 ? '#f59e0b' : item.volume_ratio >= 1.5 ? '#06b6d4' : '#6b7c93' }}>
                  {item.volume_ratio.toFixed(1)}×
                </span>
              )}
            </div>
            <div className="flex items-end gap-0.5 h-4">
              {[1,2,3,4,5].map(i => {
                const ratio = item.volume_ratio ?? 0
                const filled = i <= Math.min(5, Math.round(ratio))
                const color = ratio >= 2.5 ? '#f59e0b' : ratio >= 1.5 ? '#06b6d4' : '#3d5a78'
                return (
                  <div key={i} className="flex-1 rounded-sm"
                    style={{ height: `${(i / 5) * 100}%`, background: filled ? color : '#111d30' }} />
                )
              })}
            </div>
            <div className="text-[7px] mt-0.5" style={{ color: (item.volume_ratio ?? 0) >= 2 ? '#f59e0b' : '#6b7c93' }}>
              {(item.volume_ratio ?? 0) >= 2.5 ? 'High surge' : (item.volume_ratio ?? 0) >= 1.5 ? 'Above avg' : 'Normal'}
            </div>
          </div>
        </div>

        {/* Row 6: Entry / Stop / Target */}
        {(item.entry_price || item.stop_loss || item.target_price) && (
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #0f1e35' }}>
            <div className="grid grid-cols-3">
              <div className="flex flex-col items-center py-1.5 px-1"
                style={{ background: 'rgba(6,182,212,0.05)', borderRight: '1px solid #0f1e35' }}>
                <span className="text-[7px] text-muted uppercase tracking-wide">Entry</span>
                <span className="num text-[10px] font-bold text-[#06b6d4] mt-0.5">{fmtPrice(item.entry_price)}</span>
              </div>
              <div className="flex flex-col items-center py-1.5 px-1"
                style={{ background: 'rgba(240,56,79,0.05)', borderRight: '1px solid #0f1e35' }}>
                <span className="text-[7px] text-muted uppercase tracking-wide">Stop</span>
                <span className="num text-[10px] font-bold text-[#f0384f] mt-0.5">{fmtPrice(item.stop_loss)}</span>
              </div>
              <div className="flex flex-col items-center py-1.5 px-1"
                style={{ background: 'rgba(0,214,143,0.05)' }}>
                <span className="text-[7px] text-muted uppercase tracking-wide">Target</span>
                <span className="num text-[10px] font-bold text-[#00d68f] mt-0.5">{fmtPrice(item.target_price)}</span>
              </div>
            </div>
            {item.risk_reward != null && (
              <div className="text-center py-0.5" style={{ background: '#060d1c', borderTop: '1px solid #0f1e35' }}>
                <span className="text-[7px] text-muted">R:R = </span>
                <span className="num text-[8px] font-bold"
                  style={{ color: item.risk_reward >= 2 ? '#00d68f' : '#fbbf24' }}>
                  1:{item.risk_reward.toFixed(1)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Row 7: Why / Confidence */}
        <div className="flex flex-col gap-1 mt-auto pt-2" style={{ borderTop: '1px solid #0f1e35' }}>
          {item.why && (
            <div className="text-[8px] text-text-secondary leading-tight">{item.why}</div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span style={{ color: confCfg.color }} className="text-[8px]">{confCfg.dot}</span>
              <span className="text-[8px] font-semibold" style={{ color: confCfg.color }}>{item.confidence} CONF</span>
              {item.matched_presets.length > 1 && (
                <span className="text-[7px] text-muted">· {item.matched_presets.length} signals</span>
              )}
            </div>
            <span className="text-[8px] text-muted opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
              Analyze <ExternalLink size={8} />
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
