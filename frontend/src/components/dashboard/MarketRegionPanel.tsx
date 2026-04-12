'use client'

import { cn, formatPrice, formatPct, changeColor, changeBg } from '@/lib/utils'
import type { MarketQuote } from '@/lib/types'

const FRIENDLY: Record<string, string> = {
  '^GSPC': 'S&P 500', 'SPY': 'S&P 500',
  '^IXIC': 'NASDAQ',  'QQQ': 'NASDAQ',
  '^DJI':  'Dow Jones',
  '^RUT':  'Russell 2K',
  '^FTSE': 'FTSE 100',
  '^GDAXI':'DAX',
  '^FCHI': 'CAC 40',
  '^STOXX50E': 'Euro Stoxx',
  '^N225': 'Nikkei 225',
  '^HSI':  'Hang Seng',
  '^AXJO': 'ASX 200',
  '^KS11': 'KOSPI',
  'GC=F':  'Gold',
  '^VIX':  'VIX',
  'DX-Y.NYB': 'DXY',
  '^TNX':  '10Y Bond',
  // India
  '^NSEI':    'NIFTY 50',
  '^BSESN':   'SENSEX',
  '^NSEBANK': 'Bank NIFTY',
  '^CNXIT':   'NIFTY IT',
  '^INDIAVIX':'India VIX',
  'USDINR=X': 'USD/INR',
}

interface Props {
  title:       string
  symbol:      string
  quotes:      MarketQuote[]
  tileSymbols: string[]
}

export function MarketRegionPanel({ title, symbol, quotes, tileSymbols }: Props) {
  const bySymbol = Object.fromEntries(quotes.map(q => [q.symbol, q]))

  // Always show exactly 4 tiles in a 2×2 grid
  const tiles = tileSymbols.slice(0, 4)

  return (
    <div className="card">
      {/* Region header with accent */}
      <div className="region-header">
        <span className="text-sm leading-none">{symbol}</span>
        <span className="region-title">{title}</span>
      </div>

      {/* 2×2 symmetrical tile grid */}
      <div className="sym-grid-2x2">
        {tiles.map(sym => {
          const q   = bySymbol[sym]
          const pct = q?.change_pct ?? null
          const dir = pct == null ? 'flat' : pct > 0 ? 'bull' : pct < 0 ? 'bear' : 'flat'
          const label = q?.name ?? sym

          return (
            <div
              key={sym}
              className={cn('metric-tile', dir)}
            >
              {/* Friendly name with static fallback */}
              <div className="text-[9px] text-muted font-medium tracking-wider uppercase truncate w-full text-center">
                {FRIENDLY[sym] ?? q?.name?.split(' ').slice(0, 2).join(' ') ?? sym.replace('^', '').replace('=F', '').replace('-Y.NYB', '')}
              </div>

              {/* Price — primary metric */}
              <div className="num text-[12px] font-semibold text-text-primary tracking-tight leading-tight">
                {q?.price != null ? formatPrice(q.price, q.price > 999 ? 0 : 2) : '—'}
              </div>

              {/* Change — color-coded */}
              <div className={cn('num text-[10px] font-medium', changeColor(pct))}>
                {formatPct(pct)}
              </div>
            </div>
          )
        })}
      </div>

      {/* Extended list — remaining quotes */}
      {quotes.length > 4 && (
        <div className="mt-1 border-t border-[#1c2030] pt-1">
          {quotes.filter(q => !tileSymbols.slice(0, 4).includes(q.symbol)).slice(0, 3).map(q => (
            <div key={q.symbol} className="flex items-center justify-between py-px">
              <span className="text-[9px] text-muted truncate">{FRIENDLY[q.symbol] ?? q.name ?? q.symbol}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="num text-[9px] text-text-primary">{formatPrice(q.price, 2)}</span>
                <span className={cn('num text-[9px] font-medium', changeColor(q.change_pct))}>
                  {formatPct(q.change_pct)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
