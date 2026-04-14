'use client'

import useSWR from 'swr'
import { swrFetcher } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { useEffect, useState } from 'react'
import type { WatchlistItem, AlertResponse } from '@/lib/types'
import { MarketPulseBar }    from '@/components/dashboard/MarketPulseBar'
import { OpportunityHub }    from '@/components/opportunities/OpportunityHub'
import { BriefingBanner }    from '@/components/dashboard/BriefingBanner'
import { WatchlistPanel }    from '@/components/dashboard/WatchlistPanel'
import { AlertPanel }        from '@/components/dashboard/AlertPanel'
import { NewsSentimentColumns } from '@/components/dashboard/NewsSentimentColumns'
import { SectorHeatMap }     from '@/components/dashboard/SectorHeatMap'
import { MomentumLeadersLaggards } from '@/components/dashboard/MomentumLeadersLaggards'
import { SkeletonCard }      from '@/components/shared/SkeletonCard'
import type { NewsDistribution, MomentumScanResult } from '@/lib/types'
import { Target, TrendingUp, Newspaper, Bell } from 'lucide-react'

interface UserPrefs { markets: string[]; home_region: string }

function SectionHeader({ icon: Icon, title, subtitle, color = '#7c3aed' }: {
  icon: React.ElementType; title: string; subtitle?: string; color?: string
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}18`, border: `1px solid ${color}40` }}>
        <Icon size={13} style={{ color }} />
      </div>
      <div>
        <div className="text-[13px] font-bold text-text-primary leading-none">{title}</div>
        {subtitle && <div className="text-[9px] text-muted mt-0.5">{subtitle}</div>}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [prefs, setPrefs] = useState<UserPrefs>({ markets: ['india','americas','emea','asia'], home_region: 'india' })

  useEffect(() => {
    if (user) {
      api.users.preferences().then((p: any) => setPrefs(p)).catch(() => {})
    }
  }, [user])

  const defaultRegion = prefs.home_region === 'india' ? 'india' : prefs.home_region === 'americas' ? 'us' : 'all'

  const { data: watchlist } = useSWR<WatchlistItem[]>(
    '/api/v1/market/watchlist', swrFetcher, { refreshInterval: 60_000 }
  )
  const { data: alerts } = useSWR<AlertResponse[]>(
    '/api/v1/alerts/triggered', swrFetcher, { refreshInterval: 60_000 }
  )
  const { data: newsDistrib, isLoading: newsLoading } = useSWR<NewsDistribution>(
    '/api/v1/news/impact-distribution?hours_back=24', swrFetcher, { refreshInterval: 600_000 }
  )
  const { data: momentum, isLoading: momLoading } = useSWR<MomentumScanResult>(
    '/api/v1/momentum/scan', swrFetcher, { refreshInterval: 1_800_000 }
  )

  const triggeredCount = alerts?.length ?? 0

  return (
    <div className="p-3 space-y-3 animate-fade-in">

      {/* ── 1. Market Pulse — global ticker + regime + breadth ─── */}
      <MarketPulseBar />

      {/* ── 2. Briefing banner (AI morning brief) ───────────────── */}
      <BriefingBanner />

      {/* ── 3. Main layout: Opportunities (wide) + Sidebar ──────── */}
      <div className="grid grid-cols-[1fr_300px] gap-3 items-start">

        {/* LEFT: Opportunity Hub */}
        <div className="min-w-0">
          <SectionHeader
            icon={Target}
            title="Investment & Trading Opportunities"
            subtitle="Deep multi-signal analysis across global markets · Auto-refreshes every 5 min"
            color="#7c3aed"
          />
          <OpportunityHub defaultRegion={defaultRegion} />
        </div>

        {/* RIGHT: Sidebar */}
        <div className="flex flex-col gap-3 sticky top-[88px]">

          {/* Watchlist */}
          <div>
            <SectionHeader icon={TrendingUp} title="Watchlist" color="#05d98b" />
            <WatchlistPanel items={watchlist ?? []} />
          </div>

          {/* Triggered Alerts */}
          {triggeredCount > 0 && (
            <div>
              <SectionHeader
                icon={Bell}
                title={`Alerts (${triggeredCount})`}
                subtitle="Recently triggered"
                color="#f0384f"
              />
              <AlertPanel alerts={alerts ?? []} />
            </div>
          )}
        </div>
      </div>

      {/* ── 4. Momentum leaders / laggards (full width) ──────────── */}
      <div>
        <SectionHeader
          icon={TrendingUp}
          title="Momentum Scan"
          subtitle="Leaders and laggards by composite momentum score"
          color="#06b6d4"
        />
        {momLoading ? <SkeletonCard rows={5} /> : (
          <MomentumLeadersLaggards
            leaders={momentum?.leaders ?? []}
            laggards={momentum?.laggards ?? []}
            updatedAt={momentum?.updated_at}
          />
        )}
      </div>

      {/* ── 5. Sector heatmap + News intelligence (side by side) ─── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <SectionHeader icon={TrendingUp} title="Sector Heat Map" subtitle="Sector rotation intelligence" color="#f59e0b" />
          <SectorHeatMap />
        </div>
        <div>
          <SectionHeader icon={Newspaper} title="News Intelligence" subtitle="Sentiment distribution last 24h" color="#06b6d4" />
          {newsLoading ? <SkeletonCard rows={4} /> : (
            <NewsSentimentColumns distribution={newsDistrib} />
          )}
        </div>
      </div>

    </div>
  )
}
