'use client'

interface Props { message?: string }

export function Loader({ message = 'Loading...' }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-64 gap-4">
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-brand animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <p className="text-xs text-muted">{message}</p>
    </div>
  )
}
