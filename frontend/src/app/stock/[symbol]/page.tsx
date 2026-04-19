'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import {
  TrendingUp, TrendingDown, Activity, AlertCircle, ExternalLink,
  ChevronLeft, BarChart2, Brain, Globe, Newspaper, Loader2,
  ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────
interface Profile { symbol: string; name: string; sector?: string; industry?: string; country?: string; exchange?: string; currency?: string; market_cap?: number; pe_ratio?: number; eps?: number; beta?: number; dividend_yield?: number; week_52_high?: number; week_52_low?: number; avg_volume?: number; description?: string; website?: string }
interface OHLCVBar { date: string; open?: number; high?: number; low?: number; close: number; volume?: number }
interface NewsItem { headline: string; source?: string; url?: string; published_at: string; sentiment: string; summary?: string }
interface Prediction { symbol: string; current_price: number; target_price: number; lower_bound: number; upper_bound: number; trend: string; signal: string; confidence: number; forecast: { date: string; predicted: number; lower: number; upper: number }[]; model: string; note: string }
interface TechSnapshot { symbol: string; price: number; rsi_14?: number; sma_20?: number; sma_50?: number; sma_200?: number; macd?: number; macd_hist?: number; bb_upper?: number; bb_lower?: number; bb_pct?: number; week_52_high?: number; week_52_low?: number; pct_from_high?: number; pct_from_low?: number; rsi_signal?: string; trend_signal?: string; overall?: string }

// ── Helpers ──────────────────────────────────────────────────────
const fmt  = (v?: number, dec = 2) => v == null ? '—' : v.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const fmtM = (v?: number) => { if (!v) return '—'; if (Math.abs(v) >= 1e12) return `${(v/1e12).toFixed(2)}T`; if (Math.abs(v) >= 1e9) return `${(v/1e9).toFixed(2)}B`; return `${(v/1e6).toFixed(0)}M` }
const signalColor = (s?: string) => ({ strong_buy: '#00d68f', buy: '#4ade80', hold: '#f59e0b', sell: '#fb923c', strong_sell: '#ff4d6d' })[s ?? ''] ?? '#64748b'
const sentimentIcon = (s: string) => s === 'bullish' ? '▲' : s === 'bearish' ? '▼' : '◆'
const sentimentColor = (s: string) => s === 'bullish' ? '#00d68f' : s === 'bearish' ? '#ff4d6d' : '#f59e0b'

// ── Candlestick Chart ─────────────────────────────────────────────
function CandlestickChart({ data, prediction }: { data: OHLCVBar[], prediction?: Prediction }) {
  const chartRef = useRef<HTMLDivElement>(null)
  const lcRef    = useRef<any>(null)
  const roRef    = useRef<ResizeObserver | null>(null)

  useEffect(() => {
    if (!chartRef.current || !data.length) return

    // Guard flag — flipped to true when this effect instance is cleaned up.
    // Prevents the async .then() from acting on a disposed chart.
    let cancelled = false

    import('lightweight-charts').then(({ createChart, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries }) => {
      if (cancelled || !chartRef.current) return

      // Safely remove any previous chart instance
      if (lcRef.current) {
        try { lcRef.current.remove() } catch { /* already disposed */ }
        lcRef.current = null
      }

      const cs = getComputedStyle(document.documentElement)
      const borderColor = cs.getPropertyValue('--border-default').trim() || '#1a3050'
      const textColor   = cs.getPropertyValue('--t3').trim() || '#64748b'
      const gridColor   = cs.getPropertyValue('--border-dim').trim() || 'rgba(26,48,80,0.4)'
      const chart = createChart(chartRef.current, {
        width:  chartRef.current.clientWidth,
        height: 360,
        layout: { background: { color: 'transparent' }, textColor },
        grid:   { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor },
        timeScale:       { borderColor, timeVisible: true },
      })
      lcRef.current = chart

      const candles = chart.addSeries(CandlestickSeries, {
        upColor: '#00d68f', downColor: '#ff4d6d',
        borderUpColor: '#00d68f', borderDownColor: '#ff4d6d',
        wickUpColor: '#00d68f', wickDownColor: '#ff4d6d',
      })
      candles.setData(data.filter(b => b.open && b.high && b.low).map(b => ({
        time: b.date as any,
        open: b.open!, high: b.high!, low: b.low!, close: b.close,
      })))

      // Volume bars
      const volSeries = chart.addSeries(HistogramSeries, {
        color: 'rgba(99,102,241,0.25)',
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      })
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
      volSeries.setData(data.filter(b => b.volume).map(b => ({
        time: b.date as any, value: b.volume!,
        color: b.close >= (b.open ?? b.close) ? 'rgba(0,214,143,0.3)' : 'rgba(255,77,109,0.3)',
      })))

      // 20-day SMA overlay
      const closes = data.map(b => b.close)
      if (closes.length >= 20) {
        const smaData = data.slice(19).map((b, i) => ({
          time: b.date as any,
          value: closes.slice(i, i + 20).reduce((a, v) => a + v, 0) / 20,
        }))
        const smaSeries = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, priceLineVisible: false })
        smaSeries.setData(smaData)
      }

      // Prediction line
      if (prediction?.forecast?.length) {
        const predLine = chart.addSeries(LineSeries, {
          color: '#a78bfa', lineWidth: 2, lineStyle: 2,
          title: `Prophet ${prediction.forecast.length}d`,
        })
        const lastHistDate = data[data.length - 1].date
        const histPoint = { time: lastHistDate as any, value: data[data.length - 1].close }
        const predPoints = prediction.forecast.map(f => ({ time: f.date as any, value: f.predicted }))
        predLine.setData([histPoint, ...predPoints])
      }

      // ResizeObserver — stored in a ref so the outer cleanup can disconnect it
      roRef.current?.disconnect()
      const ro = new ResizeObserver(() => {
        if (chartRef.current && !cancelled)
          chart.applyOptions({ width: chartRef.current.clientWidth })
      })
      ro.observe(chartRef.current)
      roRef.current = ro
    })

    return () => {
      cancelled = true
      roRef.current?.disconnect()
      roRef.current = null
      if (lcRef.current) {
        try { lcRef.current.remove() } catch { /* already disposed */ }
        lcRef.current = null
      }
    }
  }, [data, prediction])

  return <div ref={chartRef} className="w-full" />
}

// ── RSI Gauge ────────────────────────────────────────────────────
function RSIGauge({ value }: { value: number }) {
  const color = value > 70 ? '#ff4d6d' : value < 30 ? '#00d68f' : '#f59e0b'
  const pct   = Math.min(100, Math.max(0, value))
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-raised)' }}>
        <div style={{ width: `${pct}%`, background: color, height: '100%', transition: 'width 0.5s' }} />
      </div>
      <span className="num text-[11px] font-bold" style={{ color }}>{value.toFixed(0)}</span>
    </div>
  )
}

// ── 52W Range Bar ────────────────────────────────────────────────
function RangeBar({ low, high, current }: { low: number; high: number; current: number }) {
  const pct = ((current - low) / (high - low + 1e-10)) * 100
  return (
    <div className="space-y-1">
      <div className="relative h-1.5 rounded-full" style={{ background: 'var(--bg-raised)' }}>
        <div className="absolute inset-y-0 rounded-full" style={{ left: 0, right: `${100 - pct}%`, background: 'linear-gradient(90deg,#ff4d6d,#f59e0b,#00d68f)' }} />
        <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border-2" style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)', background: '#fff', borderColor: '#4f46e5' }} />
      </div>
      <div className="flex justify-between text-[9px] text-muted">
        <span className="num">{fmt(low)}</span>
        <span className="text-text-secondary">52W Range</span>
        <span className="num">{fmt(high)}</span>
      </div>
    </div>
  )
}

// ── Signal Badge ─────────────────────────────────────────────────
function SignalBadge({ signal }: { signal?: string }) {
  const labels: Record<string, string> = { strong_buy: 'STRONG BUY', buy: 'BUY', hold: 'HOLD', sell: 'SELL', strong_sell: 'STRONG SELL' }
  const color = signalColor(signal)
  return (
    <span className="text-[11px] font-bold px-2.5 py-1 rounded" style={{ color, background: `${color}18`, border: `1px solid ${color}40` }}>
      {labels[signal ?? ''] ?? signal?.toUpperCase() ?? '—'}
    </span>
  )
}

// ── Prediction Widget ────────────────────────────────────────────
function PredictionWidget({ pred }: { pred: Prediction }) {
  const upside = ((pred.target_price - pred.current_price) / pred.current_price * 100)
  const trendColor = pred.trend === 'up' ? '#00d68f' : pred.trend === 'down' ? '#ff4d6d' : '#f59e0b'

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-2 rounded" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-default)' }}>
          <div className="text-[9px] text-muted uppercase mb-0.5">Current</div>
          <div className="num text-[14px] font-bold text-text-primary">{fmt(pred.current_price)}</div>
        </div>
        <div className="text-center p-2 rounded" style={{ background: `${trendColor}18`, border: `1px solid ${trendColor}40` }}>
          <div className="text-[9px] text-muted uppercase mb-0.5">30d Target</div>
          <div className="num text-[14px] font-bold" style={{ color: trendColor }}>{fmt(pred.target_price)}</div>
        </div>
        <div className="text-center p-2 rounded" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-default)' }}>
          <div className="text-[9px] text-muted uppercase mb-0.5">Upside</div>
          <div className="num text-[14px] font-bold" style={{ color: trendColor }}>
            {upside >= 0 ? '+' : ''}{upside.toFixed(1)}%
          </div>
        </div>
      </div>

      <div>
        <div className="text-[9px] text-muted mb-1">Confidence Band</div>
        <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-raised)' }}>
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${((pred.lower_bound - pred.current_price * 0.8) / (pred.current_price * 0.4)) * 100}%`,
            right: `${100 - ((pred.upper_bound - pred.current_price * 0.8) / (pred.current_price * 0.4)) * 100}%`,
            background: `${trendColor}40`,
          }} />
        </div>
        <div className="flex justify-between text-[9px] text-muted mt-0.5">
          <span className="num">Low: {fmt(pred.lower_bound)}</span>
          <span className="num">High: {fmt(pred.upper_bound)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted">Signal:</span>
          <SignalBadge signal={pred.signal} />
        </div>
        <div className="text-right">
          <div className="text-[9px] text-muted">Confidence</div>
          <div className="text-[12px] font-bold text-brand">{(pred.confidence * 100).toFixed(0)}%</div>
        </div>
      </div>

      <div className="flex items-center gap-1 py-1.5 px-2 rounded text-[9px] text-muted" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
        <AlertCircle size={10} className="text-warn flex-shrink-0" />
        {pred.note}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────
export default function StockPage() {
  const { symbol } = useParams<{ symbol: string }>()
  const router     = useRouter()
  const sym        = symbol?.toUpperCase() ?? ''

  const [profile,  setProfile]  = useState<Profile | null>(null)
  const [history,  setHistory]  = useState<OHLCVBar[]>([])
  const [news,     setNews]     = useState<NewsItem[]>([])
  const [predict,  setPredict]  = useState<Prediction | null>(null)
  const [tech,     setTech]     = useState<TechSnapshot | null>(null)
  const [period,   setPeriod]   = useState<'3mo' | '6mo' | '1y' | '2y'>('1y')
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  useEffect(() => {
    if (!sym) return
    setLoading(true)
    setError('')
    Promise.all([
      api.stock.profile(sym).catch(() => null),
      api.stock.history(sym, '1y').catch(() => []),
      api.stock.news(sym, 30).catch(() => []),
      api.stock.technical(sym).catch(() => null),
      api.stock.predict(sym, 30).catch(() => null),
    ]).then(([p, h, n, t, pred]) => {
      setProfile(p as Profile | null)
      setHistory(h as OHLCVBar[])
      setNews(n as NewsItem[])
      setTech(t as TechSnapshot | null)
      setPredict(pred as Prediction | null)
      if (!p) setError('Symbol not found or no data available')
    }).finally(() => setLoading(false))
  }, [sym])

  // Re-fetch history on period change
  useEffect(() => {
    if (!sym || loading) return
    api.stock.history(sym, period).then(h => setHistory(h as OHLCVBar[])).catch(() => {})
  }, [period])

  const currentPrice = history.length ? history[history.length - 1].close : null
  const prevClose    = history.length > 1 ? history[history.length - 2].close : null
  const priceChange  = currentPrice && prevClose ? currentPrice - prevClose : null
  const pricePct     = priceChange && prevClose ? (priceChange / prevClose * 100) : null
  const isUp         = (pricePct ?? 0) >= 0

  const newsBull = news.filter(n => n.sentiment === 'bullish')
  const newsBear = news.filter(n => n.sentiment === 'bearish')
  const newsNeut = news.filter(n => n.sentiment === 'neutral')

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <Loader2 size={28} className="animate-spin text-brand" />
      <span className="text-[11px] text-muted">Loading {sym}...</span>
    </div>
  )

  if (error && !profile) return (
    <div className="flex flex-col items-center justify-center h-64 gap-2">
      <AlertCircle size={24} className="text-bear" />
      <div className="text-[12px] text-text-secondary">{error}</div>
      <button onClick={() => router.back()} className="btn btn-ghost text-[11px]">← Go back</button>
    </div>
  )

  return (
    <div className="p-3 space-y-3 animate-fade-in">

      {/* ── Hero Header ─────────────────────────────────────────── */}
      <div className="card">
        {/* 3-col: back | symbol+price centred | website */}
        <div className="grid items-center" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
          <button onClick={() => router.back()} className="text-muted hover:text-text-primary transition-colors">
            <ChevronLeft size={16} />
          </button>

          {/* Centre: symbol, badges, name, price */}
          <div className="flex flex-col items-center text-center gap-0.5 px-4">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <h1 className="text-[18px] font-bold text-text-primary">{sym}</h1>
              {profile?.exchange && <span className="badge badge-neutral text-[9px]">{profile.exchange}</span>}
              {profile?.sector  && <span className="badge badge-neutral text-[9px]">{profile.sector}</span>}
              {tech?.overall    && <SignalBadge signal={tech.overall} />}
            </div>
            <div className="text-[11px] text-text-secondary">{profile?.name ?? sym}</div>
            <div className="num text-[22px] font-bold text-text-primary mt-1">
              {currentPrice ? fmt(currentPrice) : '—'}
              {profile?.currency && <span className="text-[11px] text-muted ml-1">{profile.currency}</span>}
            </div>
            {priceChange != null && pricePct != null && (
              <div className="flex items-center justify-center gap-1" style={{ color: isUp ? '#00d68f' : '#ff4d6d' }}>
                {isUp ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                <span className="num text-[12px] font-semibold">
                  {isUp ? '+' : ''}{fmt(priceChange)} ({isUp ? '+' : ''}{pricePct.toFixed(2)}%)
                </span>
              </div>
            )}
          </div>

          {/* Right: website */}
          <div>
            {profile?.website ? (
              <a href={profile.website} target="_blank" rel="noopener noreferrer"
                 className="nav-item" title="Company website">
                <ExternalLink size={12} />
              </a>
            ) : <span />}
          </div>
        </div>
      </div>

      {/* ── Chart — full width ──────────────────────────────────── */}
      <div className="card space-y-2">
        <div className="grid items-center gap-2" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
          <div className="text-[9px] text-muted flex gap-3 justify-start">
            <span className="flex items-center gap-1"><span className="w-2 h-0.5 inline-block rounded bg-[#f59e0b]" /> SMA20</span>
            {predict && <span className="flex items-center gap-1"><span className="w-2 h-0.5 inline-block rounded bg-[#a78bfa]" style={{ borderTop: '2px dashed #a78bfa' }} /> 30d Forecast</span>}
          </div>
          <div className="section-header justify-center m-0">
            <BarChart2 size={12} className="text-brand" />
            <span className="section-title">Price History</span>
            {predict && <span className="text-[10px] text-brand ml-1">+ Prophet Forecast</span>}
          </div>
          <div className="flex gap-1 justify-end">
            {(['3mo','6mo','1y','2y'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className="text-[10px] px-2 py-0.5 rounded transition-colors"
                style={{
                  background: period === p ? '#1e3a5f' : 'transparent',
                  color: period === p ? '#93c5fd' : '#4a5578',
                  border: `1px solid ${period === p ? '#3b82f6' : '#1a2235'}`,
                }}>
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <CandlestickChart data={history} prediction={predict ?? undefined} />
      </div>

      {/* ── ML + Technical + Fundamentals ────────────────────────── */}
      <div className={cn('grid grid-cols-1 md:grid-cols-2 gap-3', predict && 'lg:grid-cols-3')}>

        {/* ML Prediction */}
        {predict && (
          <div className="card">
            <div className="section-header justify-center">
              <Brain size={12} className="text-brand" />
              <span className="section-title">ML Price Prediction</span>
              <span className="text-[9px] text-muted ml-1">30 days</span>
            </div>
            <PredictionWidget pred={predict} />
          </div>
        )}

        {/* Technical Snapshot */}
        {tech && (
          <div className="card space-y-2">
            <div className="section-header justify-center">
              <Activity size={12} className="text-warn" />
              <span className="section-title">Technical Snapshot</span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px]">
              <div>
                <div className="text-muted mb-1">RSI (14)</div>
                {tech.rsi_14 != null && <RSIGauge value={tech.rsi_14} />}
                <div className="text-[9px] text-muted mt-0.5 capitalize">{tech.rsi_signal}</div>
              </div>
              <div>
                <div className="text-muted mb-1">Trend</div>
                <div className="font-semibold capitalize" style={{ color: tech.trend_signal === 'bullish' ? '#00d68f' : tech.trend_signal === 'bearish' ? '#ff4d6d' : '#f59e0b' }}>
                  {tech.trend_signal}
                </div>
              </div>
              {tech.macd != null && (
                <div>
                  <div className="text-muted mb-0.5">MACD</div>
                  <span className="num font-semibold" style={{ color: (tech.macd_hist ?? 0) >= 0 ? '#00d68f' : '#ff4d6d' }}>{fmt(tech.macd, 3)}</span>
                </div>
              )}
              {tech.bb_pct != null && (
                <div>
                  <div className="text-muted mb-0.5">BB %</div>
                  <span className="num font-semibold text-text-secondary">{(tech.bb_pct * 100).toFixed(0)}%</span>
                </div>
              )}
            </div>

            <div className="space-y-1 pt-1" style={{ borderTop: '1px solid var(--border-default)' }}>
              {[['SMA 20', tech.sma_20], ['SMA 50', tech.sma_50], ['SMA 200', tech.sma_200]].map(([lbl, val]) => (
                val != null && (
                  <div key={lbl as string} className="flex justify-between items-center text-[10px]">
                    <span className="text-muted">{lbl}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="num text-text-secondary">{fmt(val as number)}</span>
                      {currentPrice != null && (
                        currentPrice > (val as number)
                          ? <ArrowUpRight size={10} className="text-bull" />
                          : <ArrowDownRight size={10} className="text-bear" />
                      )}
                    </div>
                  </div>
                )
              ))}
            </div>

            {tech.week_52_high && tech.week_52_low && currentPrice && (
              <div className="pt-1" style={{ borderTop: '1px solid var(--border-default)' }}>
                <RangeBar low={tech.week_52_low} high={tech.week_52_high} current={currentPrice} />
              </div>
            )}
          </div>
        )}

        {/* Fundamentals */}
        {profile && (
          <div className="card">
            <div className="section-header justify-center">
              <Globe size={12} className="text-text-secondary" />
              <span className="section-title">Fundamentals</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
              {[
                ['Market Cap',  fmtM(profile.market_cap)],
                ['P/E Ratio',   fmt(profile.pe_ratio)],
                ['EPS',         fmt(profile.eps)],
                ['Beta',        fmt(profile.beta)],
                ['Div Yield',   profile.dividend_yield ? `${(profile.dividend_yield * 100).toFixed(2)}%` : '—'],
                ['Avg Volume',  fmtM(profile.avg_volume)],
                ['Country',     profile.country ?? '—'],
                ['Industry',    profile.industry ?? '—'],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between pb-1 last:border-0" style={{ borderBottom: '1px solid var(--border-default)' }}>
                  <span className="text-muted">{label}</span>
                  <span className="num text-text-primary font-medium">{val}</span>
                </div>
              ))}
            </div>
            {profile.description && (
              <p className="text-[9px] text-muted mt-2 leading-relaxed line-clamp-3">{profile.description}</p>
            )}
          </div>
        )}
      </div>

      {/* ── News ─────────────────────────────────────────────────── */}
      <div className="card">
        <div className="section-header justify-center">
          <Newspaper size={12} className="text-text-secondary" />
          <span className="section-title">News & Sentiment</span>
        </div>

        <div className="flex justify-center gap-6 mt-1 mb-2">
          <span className="text-[11px] font-semibold" style={{ color: '#00d68f' }}>▲ {newsBull.length} Bullish</span>
          <span className="text-[11px] font-semibold" style={{ color: '#ff4d6d' }}>▼ {newsBear.length} Bearish</span>
          <span className="text-[11px] font-semibold" style={{ color: '#f59e0b' }}>◆ {newsNeut.length} Neutral</span>
        </div>

        {news.length === 0 ? (
          <div className="py-6 text-center text-muted text-[11px]">No recent news found for {sym}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 mt-1">
            {news.map((item, i) => (
              <a key={i} href={item.url ?? '#'} target="_blank" rel="noopener noreferrer"
                className="block p-2.5 rounded transition-colors group hover:border-brand"
                style={{ border: '1px solid var(--border-default)', background: 'var(--bg-raised)' }}>
                <div className="flex items-start gap-1.5 mb-1">
                  <span className="text-[10px] flex-shrink-0 mt-0.5" style={{ color: sentimentColor(item.sentiment) }}>
                    {sentimentIcon(item.sentiment)}
                  </span>
                  <div className="text-[10px] text-text-secondary leading-snug group-hover:text-text-primary transition-colors line-clamp-2">
                    {item.headline}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {item.source && <span className="text-[9px] text-muted">{item.source}</span>}
                  <span className="text-[9px] text-muted ml-auto">
                    {item.published_at ? new Date(item.published_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : ''}
                  </span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
