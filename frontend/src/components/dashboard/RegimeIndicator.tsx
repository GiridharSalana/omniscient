'use client'

import type { RiskRegime } from '@/lib/types'

interface Props { regime: RiskRegime }

const REGIME_CONFIG: Record<RiskRegime, {
  label:   string
  icon:    string
  desc:    string
  color:   string
  bg:      string
  border:  string
  glow:    string
  pulse:   string
}> = {
  'risk-on': {
    label:  'RISK-ON',
    icon:   '▲',
    desc:   'Equities & growth assets favored',
    color:  '#00d68f',
    bg:     'linear-gradient(135deg, rgba(0,214,143,0.12) 0%, rgba(0,214,143,0.04) 100%)',
    border: 'rgba(0,214,143,0.35)',
    glow:   '0 0 16px rgba(0,214,143,0.25)',
    pulse:  '#00d68f',
  },
  'risk-off': {
    label:  'RISK-OFF',
    icon:   '▼',
    desc:   'Safe havens & defensive positioning',
    color:  '#ff4d6d',
    bg:     'linear-gradient(135deg, rgba(255,77,109,0.12) 0%, rgba(255,77,109,0.04) 100%)',
    border: 'rgba(255,77,109,0.35)',
    glow:   '0 0 16px rgba(255,77,109,0.25)',
    pulse:  '#ff4d6d',
  },
  'transition': {
    label:  'TRANSITION',
    icon:   '◆',
    desc:   'Mixed signals — reduce position size',
    color:  '#fb923c',
    bg:     'linear-gradient(135deg, rgba(251,146,60,0.12) 0%, rgba(251,146,60,0.04) 100%)',
    border: 'rgba(251,146,60,0.35)',
    glow:   '0 0 16px rgba(251,146,60,0.25)',
    pulse:  '#fb923c',
  },
  'neutral': {
    label:  'NEUTRAL',
    icon:   '◉',
    desc:   'No clear directional bias',
    color:  '#fbbf24',
    bg:     'linear-gradient(135deg, rgba(251,191,36,0.12) 0%, rgba(251,191,36,0.04) 100%)',
    border: 'rgba(251,191,36,0.35)',
    glow:   '0 0 16px rgba(251,191,36,0.20)',
    pulse:  '#fbbf24',
  },
}

export function RegimeIndicator({ regime }: Props) {
  const cfg = REGIME_CONFIG[regime] ?? REGIME_CONFIG['neutral']

  return (
    <div className="flex items-center gap-3">
      {/* Main regime pill */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
        style={{
          background: cfg.bg,
          border:     `1px solid ${cfg.border}`,
          boxShadow:  cfg.glow,
        }}
      >
        {/* Animated pulse dot */}
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span
            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
            style={{ background: cfg.pulse }}
          />
          <span
            className="relative inline-flex rounded-full h-2 w-2"
            style={{ background: cfg.pulse, boxShadow: `0 0 6px ${cfg.pulse}` }}
          />
        </span>

        {/* Icon + Label */}
        <span
          className="text-[11px] font-bold tracking-widest"
          style={{ color: cfg.color, textShadow: `0 0 8px ${cfg.color}60` }}
        >
          {cfg.icon} {cfg.label}
        </span>
      </div>

      {/* Description — hidden on small screens */}
      <span
        className="text-[10px] hidden sm:inline"
        style={{ color: cfg.color + 'aa' }}
      >
        {cfg.desc}
      </span>
    </div>
  )
}
