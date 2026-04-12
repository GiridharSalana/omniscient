'use client'

import { cn, sentimentBg, formatRelativeTime, impactColor } from '@/lib/utils'
import type { NewsDistribution, NewsItem } from '@/lib/types'
import { Newspaper, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface Props { distribution?: NewsDistribution }

const SENTIMENT_CONFIG = {
  bullish: { label: 'Bullish', dot: 'bg-bull', textColor: 'text-bull',  icon: '🟢' },
  bearish: { label: 'Bearish', dot: 'bg-bear', textColor: 'text-bear',  icon: '🔴' },
  neutral: { label: 'Neutral', dot: 'bg-muted', textColor: 'text-muted', icon: '🟡' },
} as const

export function NewsSentimentColumns({ distribution }: Props) {
  const dist = distribution ?? {
    bullish: { count: 0, avg_impact: 0, items: [] },
    bearish: { count: 0, avg_impact: 0, items: [] },
    neutral: { count: 0, avg_impact: 0, items: [] },
  }

  return (
    <div className="card">
      {/* Header — centered */}
      <div className="section-header">
        <Newspaper size={13} className="text-info" />
        <span className="section-title">News Intelligence</span>
        <Link href="/news" className="ml-auto text-[11px] text-brand hover:text-blue-400 transition-colors">
          Full feed →
        </Link>
      </div>

      {/* 3 equal columns — strict symmetry */}
      <div className="grid grid-cols-3 gap-2">
        {(['bearish', 'neutral', 'bullish'] as const).map(sentiment => {
          const cfg  = SENTIMENT_CONFIG[sentiment]
          const data = dist[sentiment]
          return (
            <SentimentColumn
              key={sentiment}
              sentiment={sentiment}
              config={cfg}
              count={data.count}
              avgImpact={data.avg_impact}
              items={data.items}
            />
          )
        })}
      </div>
    </div>
  )
}

function SentimentColumn({
  sentiment, config, count, avgImpact, items
}: {
  sentiment: keyof NewsDistribution
  config:    { label: string; dot: string; textColor: string; icon: string }
  count:     number
  avgImpact: number
  items:     NewsItem[]
}) {
  return (
    <div className={cn('rounded border p-2 space-y-1', sentimentBg(sentiment))}>
      {/* Column header — centered */}
      <div className="flex items-center justify-center gap-1.5">
        <span className="text-xs">{config.icon}</span>
        <span className={cn('text-[10px] font-bold uppercase tracking-wider', config.textColor)}>
          {config.label}
        </span>
        <span className={cn('badge text-[9px] px-1.5 py-px',
          sentiment === 'bullish' ? 'badge-bull' :
          sentiment === 'bearish' ? 'badge-bear' : 'badge-warn'
        )}>
          {count}
        </span>
        {count > 0 && (
          <span className="text-[9px] text-muted">· <span className={cn('num font-medium', impactColor(avgImpact))}>{avgImpact.toFixed(0)}</span></span>
        )}
      </div>

      {/* News items */}
      <div className="space-y-1">
        {items.slice(0, 5).map((item: NewsItem) => (
          <NewsCard key={item.id} item={item} />
        ))}
        {items.length === 0 && (
          <div className="text-center text-muted text-xs py-2">No recent news</div>
        )}
      </div>
    </div>
  )
}

function NewsCard({ item }: { item: NewsItem }) {
  return (
    <div className="bg-[#0a1628] rounded border border-[#1a3050] px-1.5 py-1">
      {item.url ? (
        <a href={item.url} target="_blank" rel="noopener noreferrer"
           className="text-[10px] text-text-primary leading-snug hover:text-blue-400 transition-colors line-clamp-2 flex items-start gap-1">
          <span className="flex-1">{item.headline}</span>
          <ExternalLink size={8} className="flex-shrink-0 mt-0.5 text-muted" />
        </a>
      ) : (
        <p className="text-[10px] text-text-primary leading-snug line-clamp-2">{item.headline}</p>
      )}
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-[9px] text-muted truncate max-w-[60%]">{item.source}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {item.impact_score != null && (
            <span className={cn('num text-[9px]', impactColor(item.impact_score))}>{item.impact_score}</span>
          )}
          <span className="text-[9px] text-muted">{formatRelativeTime(item.published_at)}</span>
        </div>
      </div>
    </div>
  )
}
