'use client'

import type { MarketSnapshot } from '@/lib/types'

// ── Zone definitions ──────────────────────────────────────────────
const ZONES = [
  { label: 'Ext. Fear', pctStart: 0,  pctEnd: 20,  color: '#ef4444' },
  { label: 'Fear',      pctStart: 20, pctEnd: 40,  color: '#f97316' },
  { label: 'Neutral',   pctStart: 40, pctEnd: 60,  color: '#eab308' },
  { label: 'Bullish',   pctStart: 60, pctEnd: 80,  color: '#22c55e' },
  { label: 'Ext. Greed',pctStart: 80, pctEnd: 100, color: '#00d68f' },
]

function getZone(v: number) {
  return ZONES.find(z => v >= z.pctStart && v <= z.pctEnd) ?? ZONES[2]
}

/**
 * Speedometer mapping:
 *   0%   → 180° = LEFT  (9 o'clock)
 *   50%  → 270° = TOP   (12 o'clock) — note: sin(270°)=-1 → y goes UP in SVG
 *   100% → 360° = RIGHT (3 o'clock)
 *
 * Sweeping clockwise on screen (sweep-flag = 1) from LEFT → TOP → RIGHT
 * gives the classic upside-down-U speedometer arc.
 */
function pct2deg(pct: number) {
  return 180 + (pct / 100) * 180
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

/** Filled donut segment — outer arc CW then inner arc CCW to close the shape */
function donutArc(cx: number, cy: number, ri: number, ro: number, a1: number, a2: number) {
  const o1 = polar(cx, cy, ro, a1)
  const o2 = polar(cx, cy, ro, a2)
  const i2 = polar(cx, cy, ri, a2)
  const i1 = polar(cx, cy, ri, a1)
  const lg = a2 - a1 > 180 ? 1 : 0
  const f  = (v: number) => v.toFixed(2)
  return [
    `M ${f(o1.x)} ${f(o1.y)}`,
    `A ${ro} ${ro} 0 ${lg} 1 ${f(o2.x)} ${f(o2.y)}`,   // sweep CW  ✓
    `L ${f(i2.x)} ${f(i2.y)}`,
    `A ${ri} ${ri} 0 ${lg} 0 ${f(i1.x)} ${f(i1.y)}`,   // sweep CCW ✓
    'Z',
  ].join(' ')
}

// ── Component ─────────────────────────────────────────────────────
export function SentimentGauge({ snapshot }: { snapshot?: MarketSnapshot }) {
  const all = snapshot
    ? [...(snapshot.americas??[]),...(snapshot.emea??[]),...(snapshot.asia??[]),...(snapshot.india??[])]
        .filter(q => q.change_pct != null)
    : []

  const bulls = all.filter(q => (q.change_pct ?? 0) > 0).length
  const bears = all.filter(q => (q.change_pct ?? 0) < 0).length
  const total = all.length
  const value = total > 0 ? Math.round((bulls / total) * 100) : 50
  const zone  = getZone(value)

  // ── SVG constants ─────────────────────────────────────────────
  const W  = 300
  const H  = 165   // viewBox height; center is at cy = H (the flat bottom)
  const cx = W / 2 // 150
  const cy = H     // 165 — pivot sits on the flat edge
  const Ro = 138   // outer radius
  const Ri = 96    // inner radius
  const Rm = (Ro + Ri) / 2   // mid-track radius for decorative use
  const GAP = 1.8  // degree gap between zone segments

  // Needle geometry
  const nDeg   = pct2deg(value)
  const nRad   = (nDeg * Math.PI) / 180
  const nLen   = Ri - 6
  const tipX   = cx + nLen * Math.cos(nRad)
  const tipY   = cy + nLen * Math.sin(nRad)
  const pRad   = nRad + Math.PI / 2
  const bw     = 5.5
  const bx1    = cx + bw * Math.cos(pRad)
  const by1    = cy + bw * Math.sin(pRad)
  const bx2    = cx - bw * Math.cos(pRad)
  const by2    = cy - bw * Math.sin(pRad)

  // Zone-boundary tick marks: 0, 20, 40, 60, 80, 100 → angles 180 … 360
  const ticks = [0, 20, 40, 60, 80, 100]

  return (
    <div className="flex flex-col items-center w-full">
      <svg
        width={W} height={H + 8}
        viewBox={`0 0 ${W} ${H + 8}`}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <filter id="sg-glow">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="sg-needle">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* ── Track background ──────────────────────────── */}
        <path
          d={donutArc(cx, cy, Ri, Ro, 180, 360)}
          fill="#0a1824" stroke="#1a3050" strokeWidth="1"
        />

        {/* ── Colored zone segments ─────────────────────── */}
        {ZONES.map((z, i) => {
          const a1 = pct2deg(z.pctStart) + GAP
          const a2 = pct2deg(z.pctEnd)   - GAP
          const active = zone.label === z.label
          return (
            <path
              key={i}
              d={donutArc(cx, cy, Ri + 1, Ro - 1, a1, a2)}
              fill={z.color}
              opacity={active ? 1 : 0.18}
              style={active ? { filter: `drop-shadow(0 0 12px ${z.color})` } : undefined}
            />
          )
        })}

        {/* ── Zone-boundary tick marks ──────────────────── */}
        {ticks.map(pct => {
          const a  = pct2deg(pct)
          const p1 = polar(cx, cy, Ro + 3, a)
          const p2 = polar(cx, cy, Ro + 11, a)
          return (
            <line key={pct}
              x1={p1.x.toFixed(1)} y1={p1.y.toFixed(1)}
              x2={p2.x.toFixed(1)} y2={p2.y.toFixed(1)}
              stroke="#1e3a5f" strokeWidth="2" strokeLinecap="round"
            />
          )
        })}

        {/* ── "Fear" / "Greed" baseline labels ─────────── */}
        <text x={cx - Ro - 4} y={cy + 7} textAnchor="end"
          fontSize="8.5" fontWeight="600" fontFamily="Inter, sans-serif"
          fill="#ef4444" opacity="0.7">FEAR</text>
        <text x={cx + Ro + 4} y={cy + 7} textAnchor="start"
          fontSize="8.5" fontWeight="600" fontFamily="Inter, sans-serif"
          fill="#00d68f" opacity="0.7">GREED</text>

        {/* ── Zone midpoint labels along OUTER edge ────── */}
        {ZONES.map((z, i) => {
          const midPct   = (z.pctStart + z.pctEnd) / 2
          const midAngle = pct2deg(midPct)
          // Position labels slightly outside the outer arc
          const lp       = polar(cx, cy, Ro + 22, midAngle)
          const active   = zone.label === z.label
          return (
            <text
              key={i}
              x={lp.x.toFixed(1)} y={lp.y.toFixed(1)}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={active ? '9' : '7.5'}
              fontWeight={active ? '700' : '400'}
              fontFamily="Inter, sans-serif"
              fill={active ? z.color : '#2d4a66'}
              style={active ? { filter: `drop-shadow(0 0 4px ${z.color}aa)` } : undefined}
            >
              {z.label}
            </text>
          )
        })}

        {/* ── Inner fill (dark half-disc) ───────────────── */}
        <path
          d={`M ${cx - Ri} ${cy} A ${Ri} ${Ri} 0 0 1 ${cx + Ri} ${cy} Z`}
          fill="#07111f"
        />

        {/* Subtle inner ring */}
        <path
          d={`M ${cx - Ri} ${cy} A ${Ri} ${Ri} 0 0 1 ${cx + Ri} ${cy}`}
          fill="none" stroke="#1a3050" strokeWidth="1"
        />

        {/* ── Flat baseline ─────────────────────────────── */}
        <line
          x1={cx - Ro} y1={cy} x2={cx + Ro} y2={cy}
          stroke="#1a3050" strokeWidth="1.5"
        />

        {/* ── Needle ────────────────────────────────────── */}
        <polygon
          points={`${tipX.toFixed(1)},${tipY.toFixed(1)} ${bx1.toFixed(1)},${by1.toFixed(1)} ${bx2.toFixed(1)},${by2.toFixed(1)}`}
          fill={zone.color}
          filter="url(#sg-needle)"
        />
        {/* Needle pivot */}
        <circle cx={cx} cy={cy} r="9"
          fill="#0a1624" stroke={zone.color} strokeWidth="2.5"
          style={{ filter: `drop-shadow(0 0 8px ${zone.color})` }}
        />

        {/* ── Value number ──────────────────────────────── */}
        <text x={cx} y={cy - 55} textAnchor="middle"
          fontSize="32" fontWeight="800" fontFamily="JetBrains Mono, monospace"
          fill={zone.color}
          style={{ filter: `drop-shadow(0 0 12px ${zone.color}aa)` }}>
          {value}
        </text>

        {/* ── Zone name ─────────────────────────────────── */}
        <text x={cx} y={cy - 28} textAnchor="middle"
          fontSize="11" fontWeight="700" fontFamily="Inter, sans-serif"
          letterSpacing="2" fill={zone.color} opacity="0.9">
          {zone.label.toUpperCase()}
        </text>

        {/* ── Market stats ──────────────────────────────── */}
        <text x={cx} y={cy - 12} textAnchor="middle"
          fontSize="7.5" fontFamily="Inter, sans-serif" fill="#2d4a66">
          {total > 0
            ? `${bulls} advancing · ${bears} declining · ${total} markets`
            : 'Loading market data…'}
        </text>
      </svg>
    </div>
  )
}
