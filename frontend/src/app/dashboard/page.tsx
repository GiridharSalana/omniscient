'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function DashboardPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/opportunities') }, [router])
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-muted text-[12px]">Redirecting…</div>
    </div>
  )
}
