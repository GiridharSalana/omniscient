'use client'

import { cn, formatDateTime } from '@/lib/utils'
import type { AlertResponse } from '@/lib/types'
import { Bell, BellRing } from 'lucide-react'

interface Props { alerts: AlertResponse[] }

export function AlertPanel({ alerts }: Props) {
  const triggered = alerts.filter(a => a.triggered_at)
  const Icon = triggered.length > 0 ? BellRing : Bell

  return (
    <div className="card">
      <div className="section-header">
        <Icon size={13} className={triggered.length > 0 ? 'text-warn' : 'text-muted'} />
        <span className="section-title">Recent Alerts</span>
        {triggered.length > 0 && (
          <span className="badge badge-warn">{triggered.length}</span>
        )}
      </div>

      {triggered.length === 0 ? (
        <div className="text-center py-4">
          <Bell size={18} className="text-muted mx-auto mb-1.5" />
          <p className="text-muted text-[10px]">No alerts triggered today</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
          {triggered.slice(0, 12).map(alert => (
            <div key={alert.id} className="flex items-start gap-1.5 px-2.5 py-2 rounded border border-warn/20 bg-warn/5">
              <span className="text-warn flex-shrink-0 text-[10px] mt-px">⚡</span>
              <div className="flex-1 min-w-0">
                {alert.symbol && (
                  <span className="badge border border-[#1c2030] text-[8px] text-muted px-1 py-px mb-0.5 inline-block">
                    {alert.symbol}
                  </span>
                )}
                <div className="text-[10px] text-text-primary leading-snug truncate">{alert.message || alert.alert_type}</div>
                {alert.triggered_at && (
                  <div className="text-[9px] text-muted mt-0.5">{formatDateTime(alert.triggered_at)}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
