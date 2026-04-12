'use client'

interface Props {
  rows?:   number
  height?: string
}

export function SkeletonCard({ rows = 3, height }: Props) {
  return (
    <div className="card animate-pulse" style={height ? { height } : undefined}>
      <div className="h-2.5 w-28 rounded mb-3 mx-auto" style={{background:'#1a3050'}} />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-2 rounded flex-1" style={{background:'#1a3050', opacity: 1 - i * 0.12}} />
            <div className="h-2 w-14 rounded" style={{background:'#1a3050', opacity: 1 - i * 0.12}} />
            <div className="h-2 w-10 rounded" style={{background:'#1a3050', opacity: 1 - i * 0.12}} />
          </div>
        ))}
      </div>
    </div>
  )
}
