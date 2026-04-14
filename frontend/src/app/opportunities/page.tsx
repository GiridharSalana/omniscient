'use client'

import { useAuth } from '@/context/AuthContext'
import { OpportunityHub } from '@/components/opportunities/OpportunityHub'
import { Target } from 'lucide-react'

export default function OpportunitiesPage() {
  const { user } = useAuth()

  return (
    <div className="px-4 pt-3 pb-8 animate-fade-in">

      {/* ── Page header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-[20px] font-bold text-white leading-none">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.4)' }}>
              <Target size={15} style={{ color: '#a78bfa' }} />
            </span>
            Investment & Trading Opportunities
          </h1>
          <p className="text-[11px] text-muted mt-1.5 max-w-xl">
            Deep multi-signal analysis across Nifty 50 + top US stocks.
            Each opportunity is scored 0–100 using RSI, MACD, Bollinger Bands, ATR, volume surges,
            moving average crosses, and momentum — with suggested entry, stop, and target levels.
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg flex-shrink-0"
          style={{ background: 'rgba(5,217,139,0.06)', border: '1px solid rgba(5,217,139,0.2)' }}>
          <div className="pulse-dot w-2 h-2" />
          <span className="text-[10px] font-semibold" style={{ color: '#05d98b' }}>LIVE ANALYSIS</span>
        </div>
      </div>

      {/* ── Main hub ────────────────────────────────────────────── */}
      <OpportunityHub defaultRegion="all" />

    </div>
  )
}
