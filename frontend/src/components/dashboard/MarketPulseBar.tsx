'use client'

import useSWR from 'swr'
import { swrFetcher } from '@/lib/api'
import type { MarketSnapshot } from '@/lib/types'
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react'

const KEY_INDICES = [
  { symbol: '^NSEI',   label: 'NIFTY',   flag: '🇮🇳' },
  { symbol: '^BSESN',  label: 'SENSEX',  flag: '🇮🇳' },
  { symbol: '^GSPC',   label: 'S&P 500', flag: '🇺🇸' },
  { symbol: '^IXIC',   label: 'NASDAQ',  flag: '🇺🇸' },
  { symbol: '^GDAXI',  label: 'DAX',     flag: '🇩🇪' },
  { symbol: '^N225',   label: 'NIKKEI',  flag: '🇯🇵' },
  { symbol: 'GC=F',    label: 'Gold',    flag: '🥇' },
  { symbol: '^VIX',    label: 'VIX',     flag: '📊' },
]

function fmtPrice(p: number | null | undefined, symbol: string): string {
  if (p == null) return '—'
  if (p >= 10000) return p.toLocaleString('en-IN', { maximumFractionDigits: 0 })
  if (p >= 1000)  return p.toLocaleString('en-IN', { maximumFractionDigits: 1 })
  return p.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const REGIME_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  'risk-on':    { label: 'Risk ON',    color: '#05d98b', bg: 'rgba(5,217,139,0.12)'  },
  'risk-off':   { label: 'Risk OFF',   color: '#f0384f', bg: 'rgba(240,56,79,0.12)'  },
  'transition': { label: 'Transition', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  'neutral':    { label: 'Neutral',    color: '#6b7c93', bg: 'rgba(107,124,147,0.12)'},
}

export function MarketPulseBar() {
  const { data: snapshot } = useSWR<MarketSnapshot>(
    '/api/v1/market/snapshot', swrFetcher, { refreshInterval: 60_000 }
  )

  const allQuotes = [
    ...(snapshot?.americas   ?? []),
    ...(snapshot?.emea       ?? []),
    ...(snapshot?.asia       ?? []),
    ...(snapshot?.india      ?? []),
    ...(snapshot?.safe_havens?? []),
  ]
  const findQuote = (sym: string) => allQuotes.find(q => q.symbol === sym)

  const regime = snapshot?.risk_regime ?? 'neutral'
  const regimeCfg = REGIME_CONFIG[regime] ?? REGIME_CONFIG.neutral

  const advancing = allQuotes.filter(q => (q.change_pct ?? 0) > 0).length
  const declining = allQuotes.filter(q => (q.change_pct ?? 0) < 0).length
  const total = advancing + declining

  return (
    <div className="rounded-xl overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #070f1d 0%, #05091a 100%)',
        border: '1px solid #1a3050',
        boxShadow: '0 2px 20px rgba(0,0,0,0.5)',
      }}>

      {/* Top row: regime + market breadth */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-[#111d30]">

        {/* Regime */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Activity size={11} style={{ color: regimeCfg.color }} />
          <span className="text-[9px] text-muted uppercase tracking-widest">Regime</span>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded"
            style={{ color: regimeCfg.color, background: regimeCfg.bg, border: `1px solid ${regimeCfg.color}40` }}>
            {regimeCfg.label}
          </span>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-[#1a3050]" />

        {/* Breadth */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <TrendingUp size={11} style={{ color: '#05d98b' }} />
            <span className="num text-[13px] font-bold" style={{ color: '#05d98b' }}>{advancing}</span>
            <span className="text-[9px] text-muted">up</span>
          </div>
          {/* Breadth bar */}
          <div className="w-20 h-2 rounded-full overflow-hidden bg-[#1a2235]">
            <div className="h-full rounded-full"
              style={{
                width: total > 0 ? `${(advancing / total) * 100}%` : '50%',
                background: 'linear-gradient(90deg, #05d98b, #00b87a)',
                transition: 'width 0.5s ease',
              }} />
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingDown size={11} style={{ color: '#f0384f' }} />
            <span className="num text-[13px] font-bold" style={{ color: '#f0384f' }}>{declining}</span>
            <span className="text-[9px] text-muted">down</span>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-[#1a3050]" />

        {/* Updated at */}
        {snapshot && (
          <span className="text-[9px] text-muted flex-shrink-0">
            Updated {new Date(snapshot.updated_at).toLocaleTimeString('en-IN', {
              hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
            })} IST
          </span>
        )}

        <div className="flex-1" />

        {/* Live badge */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded"
          style={{ background: 'rgba(5,217,139,0.06)', border: '1px solid rgba(5,217,139,0.2)' }}>
          <div className="pulse-dot w-1.5 h-1.5" />
          <span className="text-[9px] font-semibold" style={{ color: '#05d98b' }}>LIVE</span>
        </div>
      </div>

      {/* Bottom row: scrolling indices ticker */}
      <div className="flex items-center gap-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {KEY_INDICES.map(({ symbol, label, flag }) => {
          const q = findQuote(symbol)
          const chg = q?.change_pct ?? null
          const price = q?.price ?? null
          const up = chg !== null && chg > 0
          const dn = chg !== null && chg < 0

          return (
            <div key={symbol}
              className="flex items-center gap-2.5 px-4 py-2 border-r border-[#111d30] flex-shrink-0 hover:bg-[#0b1729] transition-colors cursor-default"
              style={{ minWidth: 130 }}>
              <span className="text-sm leading-none flex-shrink-0">{flag}</span>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-text-primary tracking-tight leading-none">{label}</span>
                  {chg !== null && (
                    up ? <TrendingUp size={9} style={{ color: '#05d98b' }} />
                       : dn ? <TrendingDown size={9} style={{ color: '#f0384f' }} />
                              : <Minus size={9} className="text-muted" />
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="num text-[10px] font-semibold text-text-primary leading-none">
                    {fmtPrice(price, symbol)}
                  </span>
                  {chg !== null && (
                    <span className="num text-[9px] font-bold leading-none"
                      style={{ color: up ? '#05d98b' : dn ? '#f0384f' : '#6b7c93' }}>
                      {up ? '+' : ''}{chg.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
