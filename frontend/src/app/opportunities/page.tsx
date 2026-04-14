'use client'

import { useAuth } from '@/context/AuthContext'
import { OpportunityHub } from '@/components/opportunities/OpportunityHub'
import { Target, User } from 'lucide-react'

export default function OpportunitiesPage() {
  const { user } = useAuth()

  return (
    <div className="px-4 pt-3 pb-8 animate-fade-in">

      {/* ── Page header — three equal zones for left/right symmetry ── */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 mb-4">
        {/* Left: user badge — mirrors LIVE ANALYSIS on the right */}
        <div className="flex justify-start">
          {user?.username ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.2)' }}>
              <User size={10} style={{ color: 'var(--brand)' }} />
              <span className="text-[10px] font-semibold" style={{ color: 'var(--brand)' }}>
                {user.username}
              </span>
            </div>
          ) : <div />}
        </div>

        {/* Centre: title + subtitle */}
        <div className="flex flex-col items-center text-center">
          <h1 className="flex items-center gap-2.5 text-[20px] font-bold leading-none" style={{ color: 'var(--t1)' }}>
            <span className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.4)' }}>
              <Target size={15} style={{ color: '#a78bfa' }} />
            </span>
            Investment & Trading Opportunities
          </h1>
          <p className="text-[10px] text-muted mt-1.5 max-w-lg leading-relaxed">
            Multi-signal analysis across Nifty 50 + top US stocks · scored 0–100 via RSI, MACD,
            Bollinger Bands, ATR, volume &amp; momentum · with entry, stop &amp; target levels.
          </p>
        </div>

        {/* Right: LIVE badge */}
        <div className="flex justify-end">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(5,217,139,0.06)', border: '1px solid rgba(5,217,139,0.2)' }}>
            <div className="pulse-dot w-2 h-2" />
            <span className="text-[10px] font-semibold" style={{ color: '#05d98b' }}>LIVE ANALYSIS</span>
          </div>
        </div>
      </div>

      {/* ── Main hub ────────────────────────────────────────────── */}
      <OpportunityHub defaultRegion="all" />

    </div>
  )
}
