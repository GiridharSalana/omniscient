'use client'

import useSWR from 'swr'
import { swrFetcher } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { useEffect, useState, useRef } from 'react'
import type { MarketSnapshot, MomentumScanResult, NewsDistribution, WatchlistItem, AlertResponse } from '@/lib/types'
import { Pencil, Check, X, Globe } from 'lucide-react'
import { MarketRegionPanel }       from '@/components/dashboard/MarketRegionPanel'
import { MomentumLeadersLaggards } from '@/components/dashboard/MomentumLeadersLaggards'
import { NewsSentimentColumns }    from '@/components/dashboard/NewsSentimentColumns'
import { WatchlistPanel }          from '@/components/dashboard/WatchlistPanel'
import { AlertPanel }              from '@/components/dashboard/AlertPanel'
import { BriefingBanner }          from '@/components/dashboard/BriefingBanner'
import { RegimeIndicator }         from '@/components/dashboard/RegimeIndicator'
import { SentimentGauge }          from '@/components/dashboard/SentimentGauge'
import { MacroPanel }              from '@/components/dashboard/MacroPanel'
import { TechnicalSignals }        from '@/components/dashboard/TechnicalSignals'
import { EarningsCalendar }        from '@/components/dashboard/EarningsCalendar'
import { SectorHeatMap }           from '@/components/dashboard/SectorHeatMap'
import { EconEventsBar }           from '@/components/dashboard/EconEventsBar'
import { IndiaIntelPanel }         from '@/components/dashboard/IndiaIntelPanel'
import { SkeletonCard }            from '@/components/shared/SkeletonCard'

interface UserPrefs { markets: string[]; home_region: string }

export default function DashboardPage() {
  const { user } = useAuth()
  const [prefs, setPrefs] = useState<UserPrefs>({ markets: ['india','americas','emea','asia'], home_region: 'india' })

  useEffect(() => {
    if (user) {
      api.users.preferences().then((p: any) => setPrefs(p)).catch(() => {})
    }
  }, [user])

  const showIndia    = prefs.markets.includes('india')
  const showAmericas = prefs.markets.includes('americas')
  const showEMEA     = prefs.markets.includes('emea')
  const showAsia     = prefs.markets.includes('asia')
  const isIndiaFirst = prefs.home_region === 'india'

  // Inline home region edit
  const [editingRegion, setEditingRegion] = useState(false)
  const HOME_REGIONS = [
    { id: 'india',    flag: '🇮🇳', label: 'India'   },
    { id: 'americas', flag: '🇺🇸', label: 'Americas' },
    { id: 'emea',     flag: '🇪🇺', label: 'Europe'  },
    { id: 'asia',     flag: '🌏', label: 'Asia'    },
  ]
  const currentRegion = HOME_REGIONS.find(r => r.id === prefs.home_region) ?? HOME_REGIONS[0]

  const saveHomeRegion = async (regionId: string) => {
    setPrefs(p => ({ ...p, home_region: regionId }))
    setEditingRegion(false)
    if (user) {
      try { await api.users.updatePrefs({ home_region: regionId }) } catch {}
    }
  }

  const { data: snapshot, isLoading: snapLoading } = useSWR<MarketSnapshot>(
    '/api/v1/market/snapshot', swrFetcher, { refreshInterval: 60_000 }
  )
  const { data: momentum, isLoading: momLoading } = useSWR<MomentumScanResult>(
    '/api/v1/momentum/scan', swrFetcher, { refreshInterval: 1_800_000 }
  )
  const { data: newsDistrib, isLoading: newsLoading } = useSWR<NewsDistribution>(
    '/api/v1/news/impact-distribution?hours_back=24', swrFetcher, { refreshInterval: 600_000 }
  )
  const { data: watchlist } = useSWR<WatchlistItem[]>(
    '/api/v1/market/watchlist', swrFetcher, { refreshInterval: 60_000 }
  )
  const { data: alerts } = useSWR<AlertResponse[]>(
    '/api/v1/alerts/triggered', swrFetcher, { refreshInterval: 60_000 }
  )

  const regime = snapshot?.risk_regime ?? 'neutral'

  return (
    <div className="p-2 space-y-2 animate-fade-in">

      {/* ── Market Intelligence Banner ───────────────────────────── */}
      <div className="rounded-xl overflow-hidden"
           style={{ background: 'linear-gradient(180deg,#0a1628 0%,#060e1e 100%)', border: '1px solid #1a3050' }}>

        {/* Top strip: Regime left · Home Region right */}
        <div className="flex items-center justify-between px-4 py-2 border-b"
             style={{ borderColor: '#111d30', background: 'rgba(15,31,56,0.4)' }}>
          <RegimeIndicator regime={regime} />

          {/* Home region inline editor */}
          <div className="flex-shrink-0">
            {editingRegion ? (
              <div className="flex items-center gap-1 p-0.5 rounded-lg"
                   style={{ background: '#0f1f38', border: '1px solid #1a3050' }}>
                {HOME_REGIONS.map(r => (
                  <button key={r.id} onClick={() => saveHomeRegion(r.id)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-all"
                    style={{
                      background: r.id === prefs.home_region ? '#1e3a5f' : 'transparent',
                      color:      r.id === prefs.home_region ? '#93c5fd' : '#4b5d73',
                      border:     `1px solid ${r.id === prefs.home_region ? '#3b82f6' : 'transparent'}`,
                    }}>
                    <span>{r.flag}</span>
                    <span className="hidden sm:inline text-[9px]">{r.label}</span>
                  </button>
                ))}
                <button onClick={() => setEditingRegion(false)} className="ml-1 text-muted hover:text-text-secondary px-1">
                  <X size={11} />
                </button>
              </div>
            ) : (
              <button onClick={() => setEditingRegion(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all group"
                style={{ background: 'rgba(15,31,56,0.6)', border: '1px solid #1a2235' }}
                title="Change home region">
                <Globe size={11} className="text-muted group-hover:text-brand transition-colors" />
                <span className="text-[10px] font-medium" style={{ color: '#8da3bf' }}>
                  {currentRegion.flag} {currentRegion.label}
                </span>
                <Pencil size={9} className="text-muted group-hover:text-brand transition-colors" />
              </button>
            )}
          </div>
        </div>

        {/* Main body: Stats left · Gauge center · Stats right */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-0">

          {/* Left stats panel */}
          <div className="flex flex-col items-end gap-3 px-6 py-4">
            {snapshot ? (() => {
              const all = [...(snapshot.americas??[]),...(snapshot.emea??[]),...(snapshot.asia??[]),...(snapshot.india??[])]
              const up  = all.filter(q => (q.change_pct??0) > 0).length
              const dn  = all.filter(q => (q.change_pct??0) < 0).length
              return (
                <>
                  <div className="text-right">
                    <div className="text-[11px] text-muted uppercase tracking-wider mb-1">Advancing</div>
                    <div className="text-[28px] font-bold num leading-none" style={{ color: '#00d68f', textShadow: '0 0 20px rgba(0,214,143,0.4)' }}>{up}</div>
                    <div className="text-[9px] text-muted mt-0.5">markets rising</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-muted uppercase tracking-wider mb-1">Last Updated</div>
                    <div className="text-[11px] font-semibold num" style={{ color: '#6b7c93' }}>
                      {new Date(snapshot.updated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST
                    </div>
                  </div>
                </>
              )
            })() : (
              <div className="text-muted text-[10px]">Loading…</div>
            )}
          </div>

          {/* Center: Gauge — full width fixed */}
          <div className="flex flex-col items-center py-3 px-2"
               style={{ borderLeft: '1px solid #111d30', borderRight: '1px solid #111d30' }}>
            <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: '#334155' }}>
              Fear &amp; Greed Index
            </div>
            <SentimentGauge snapshot={snapshot} />
          </div>

          {/* Right stats panel */}
          <div className="flex flex-col items-start gap-3 px-6 py-4">
            {snapshot ? (() => {
              const all = [...(snapshot.americas??[]),...(snapshot.emea??[]),...(snapshot.asia??[]),...(snapshot.india??[])]
              const dn  = all.filter(q => (q.change_pct??0) < 0).length
              const avgChg = all.length ? (all.reduce((s,q) => s + (q.change_pct??0), 0) / all.length) : 0
              return (
                <>
                  <div>
                    <div className="text-[11px] text-muted uppercase tracking-wider mb-1">Declining</div>
                    <div className="text-[28px] font-bold num leading-none" style={{ color: '#ff4d6d', textShadow: '0 0 20px rgba(255,77,109,0.4)' }}>{dn}</div>
                    <div className="text-[9px] text-muted mt-0.5">markets falling</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted uppercase tracking-wider mb-1">Avg Change</div>
                    <div className="text-[11px] font-semibold num" style={{ color: avgChg >= 0 ? '#00d68f' : '#ff4d6d' }}>
                      {avgChg >= 0 ? '+' : ''}{avgChg.toFixed(2)}%
                    </div>
                  </div>
                </>
              )
            })() : (
              <div className="text-muted text-[10px]">Loading…</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 1: India Panel (when home_region=india) ─────────── */}
      {showIndia && isIndiaFirst && !snapLoading && (
        <div className="border rounded-lg p-0.5 overflow-hidden"
             style={{ borderColor: '#f97316', background: 'linear-gradient(135deg,rgba(249,115,22,0.06),rgba(10,22,40,0.4))' }}>
          <div className="flex items-center gap-2 px-3 py-1.5 border-b" style={{ borderColor: '#1a2235' }}>
            <span className="text-base">🇮🇳</span>
            <span className="text-[11px] font-semibold text-[#fb923c] uppercase tracking-wider">India Markets — Home Region</span>
          </div>
          <div className="grid grid-cols-2 gap-2 p-2">
            <MarketRegionPanel title="NSE · BSE"    symbol="🇮🇳" quotes={snapshot?.india ?? snapshot?.asia ?? []}    tileSymbols={['^NSEI','^BSESN','^NSEBANK','^CNXIT']} />
            <MarketRegionPanel title="India VIX · FX" symbol="📊" quotes={snapshot?.india ?? snapshot?.asia ?? []}  tileSymbols={['^INDIAVIX','USDINR=X','^NSEI','^BSESN']} />
          </div>
        </div>
      )}

      {/* ── Row 1b: World Markets (2 equal columns) ──────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          {snapLoading ? (
            <><SkeletonCard rows={4} /><SkeletonCard rows={4} /></>
          ) : (
            <>
              {showAmericas && <MarketRegionPanel title="Americas"    symbol="🌎" quotes={snapshot?.americas ?? []}    tileSymbols={['^GSPC','^IXIC','^DJI','^RUT']} />}
              {showEMEA     && <MarketRegionPanel title="EMEA"        symbol="🌍" quotes={snapshot?.emea ?? []}        tileSymbols={['^FTSE','^GDAXI','^FCHI','^STOXX50E']} />}
            </>
          )}
        </div>
        <div className="space-y-2">
          {snapLoading ? (
            <><SkeletonCard rows={4} /><SkeletonCard rows={4} /></>
          ) : (
            <>
              {showAsia && <MarketRegionPanel title="Asia-Pacific" symbol="🌏" quotes={snapshot?.asia ?? []}        tileSymbols={['^N225','^HSI','^AXJO','^KS11']} />}
              <MarketRegionPanel title="Safe Havens"  symbol="🛡️" quotes={snapshot?.safe_havens ?? []} tileSymbols={['GC=F','^VIX','DX-Y.NYB','^TNX']} />
            </>
          )}
        </div>
      </div>

      {/* ── Row 2: Economic Events bar ───────────────────────────── */}
      <EconEventsBar />

      {/* ── Row 3: Morning Briefing ───────────────────────────────── */}
      <BriefingBanner />

      {/* ── Row 4: Momentum + India Intel ──────────────────────────── */}
      <div className="grid grid-cols-[1fr_280px] gap-2">
        {momLoading ? <SkeletonCard rows={5} /> : (
          <MomentumLeadersLaggards
            leaders={momentum?.leaders ?? []}
            laggards={momentum?.laggards ?? []}
            updatedAt={momentum?.updated_at}
          />
        )}
        {showIndia && <IndiaIntelPanel />}
      </div>

      {/* ── Row 5: News Intelligence ──────────────────────────────── */}
      {newsLoading ? <SkeletonCard rows={4} /> : (
        <NewsSentimentColumns distribution={newsDistrib} />
      )}

      {/* ── Row 6: Macro + Sector ────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <MacroPanel />
        <SectorHeatMap />
      </div>

      {/* ── Row 7: Technical + Earnings ──────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <TechnicalSignals />
        <EarningsCalendar />
      </div>

      {/* ── Row 8: Watchlist ─────────────────────────────────────── */}
      <WatchlistPanel items={watchlist ?? []} />

      {/* ── Row 9: Alerts (full width below) ─────────────────────── */}
      <AlertPanel alerts={alerts ?? []} />

    </div>
  )
}
