'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import Link from 'next/link'
import {
  Zap, TrendingUp, Brain, Globe, BarChart2, ShieldCheck,
  Activity, Newspaper, ArrowRight, Star, ChevronRight
} from 'lucide-react'

const FEATURES = [
  {
    icon: Globe,
    color: '#38bdf8',
    title: 'Global Market Coverage',
    desc: 'India, US, Europe, Asia — all in one view. NIFTY, SENSEX, S&P 500, FTSE, Nikkei live.',
  },
  {
    icon: Brain,
    color: '#a78bfa',
    title: 'AI + ML Price Prediction',
    desc: 'Prophet forecasting with RSI/MACD regressors gives you 30-day price targets with confidence bands.',
  },
  {
    icon: BarChart2,
    color: '#00d68f',
    title: 'Technical Analysis',
    desc: 'RSI, MACD, Bollinger Bands, 52W range, SMA overlays — all computed locally from live data.',
  },
  {
    icon: TrendingUp,
    color: '#fb923c',
    title: 'Momentum Scanner',
    desc: 'Multi-factor momentum scoring across 50,000+ securities. Leaders & laggards at a glance.',
  },
  {
    icon: Newspaper,
    color: '#f472b6',
    title: 'News Intelligence',
    desc: 'Sentiment-scored news with RAG-powered AI chat. Ask anything about markets with full context.',
  },
  {
    icon: Activity,
    color: '#fbbf24',
    title: 'Macro Dashboard',
    desc: 'Fed Funds Rate, CPI, Yield Curve, GDP — FRED data surfaced as actionable regime signals.',
  },
]

const MARKETS = [
  { flag: '🇮🇳', name: 'NIFTY 50',   value: '24,051', change: '+0.3%', up: true },
  { flag: '🇮🇳', name: 'SENSEX',     value: '77,550', change: '+0.4%', up: true },
  { flag: '🇺🇸', name: 'S&P 500',    value: '5,204',  change: '-0.1%', up: false },
  { flag: '🇺🇸', name: 'NASDAQ',     value: '16,340', change: '-0.3%', up: false },
  { flag: '🇬🇧', name: 'FTSE 100',   value: '8,312',  change: '+0.2%', up: true },
  { flag: '🇯🇵', name: 'Nikkei 225', value: '38,820', change: '+0.5%', up: true },
]

export default function HomePage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) router.replace('/opportunities')
  }, [user, loading, router])

  if (loading || user) return null  // Brief flash prevention

  return (
    <div className="min-h-screen" style={{ background: '#030b18' }}>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full"
               style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)', filter: 'blur(40px)' }} />
          <div className="absolute top-20 right-1/4 w-80 h-80 rounded-full"
               style={{ background: 'radial-gradient(circle, rgba(0,214,143,0.08) 0%, transparent 70%)', filter: 'blur(40px)' }} />
        </div>

        <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
          {/* Logo mark */}
          <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full"
               style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)' }}>
            <div className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white"
                 style={{ background: 'linear-gradient(135deg,#4338ca,#6366f1)' }}>O</div>
            <span className="text-[11px] font-semibold tracking-widest text-[#a5b4fc] uppercase">Omniscient</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight">
            Your Personal
            <span className="block"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #a78bfa, #38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Bloomberg Alternative
            </span>
          </h1>
          <p className="text-[14px] text-[#8da3bf] max-w-xl mx-auto mb-8 leading-relaxed">
            AI-powered market intelligence for solo traders. Live indices from India, US & Global markets.
            ML price prediction. Technical analysis. News with sentiment. All free.
          </p>

          <div className="flex items-center gap-3 justify-center flex-wrap">
            <Link href="/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold text-white"
              style={{ background: 'linear-gradient(135deg,#4338ca,#7c3aed)', boxShadow: '0 0 20px rgba(99,102,241,0.35)', border: '1px solid rgba(99,102,241,0.4)' }}>
              Get Started Free
              <ArrowRight size={14} />
            </Link>
            <Link href="/login?mode=login"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-medium"
              style={{ background: 'rgba(15,31,56,0.8)', border: '1px solid #1a3050', color: '#8da3bf' }}>
              Sign In
            </Link>
          </div>

          {/* Live market ticker strip */}
          <div className="mt-10 flex items-center gap-3 justify-center flex-wrap">
            {MARKETS.map(m => (
              <div key={m.name} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                   style={{ background: 'rgba(10,22,40,0.8)', border: '1px solid #1a2235' }}>
                <span className="text-base">{m.flag}</span>
                <span className="text-[10px] text-[#64748b]">{m.name}</span>
                <span className="num text-[11px] font-semibold text-white">{m.value}</span>
                <span className="num text-[10px] font-medium" style={{ color: m.up ? '#00d68f' : '#ff4d6d' }}>
                  {m.change}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features Grid ─────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="text-center mb-8">
          <div className="text-[10px] uppercase tracking-widest text-[#4b5d73] mb-2">What you get</div>
          <h2 className="text-xl font-bold text-white">Everything a serious trader needs</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {FEATURES.map(f => {
            const Icon = f.icon
            return (
              <div key={f.title} className="p-4 rounded-xl transition-all hover:scale-[1.01]"
                   style={{ background: 'rgba(10,22,40,0.7)', border: '1px solid #1a2235', backdropFilter: 'blur(8px)' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                     style={{ background: `${f.color}14`, border: `1px solid ${f.color}30` }}>
                  <Icon size={16} style={{ color: f.color }} />
                </div>
                <h3 className="text-[12px] font-semibold text-white mb-1">{f.title}</h3>
                <p className="text-[10px] text-[#64748b] leading-relaxed">{f.desc}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Stock Deep Dive promo ─────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="rounded-2xl p-6 sm:p-8 text-center"
             style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(167,139,250,0.05))', border: '1px solid rgba(99,102,241,0.2)' }}>
          <div className="inline-flex items-center gap-2 mb-3 px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider"
               style={{ background: 'rgba(99,102,241,0.15)', color: '#a78bfa' }}>
            <Brain size={10} /> AI-Powered
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Deep Dive into any stock</h2>
          <p className="text-[11px] text-[#8da3bf] mb-4 max-w-md mx-auto">
            Search any ticker → get candlestick charts, Prophet ML forecasts, technical indicators,
            fundamentals, and sentiment-scored news — all in one page.
          </p>
          <div className="flex items-center gap-2 justify-center">
            {['RELIANCE.NS', 'INFY.NS', 'AAPL', 'NVDA', 'TCS.NS'].map(sym => (
              <span key={sym} className="text-[10px] px-2 py-1 rounded font-mono"
                    style={{ background: 'rgba(15,31,56,0.8)', border: '1px solid #1a2235', color: '#6366f1' }}>
                {sym}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pb-20 text-center">
        <div className="flex items-center gap-4 justify-center mb-4">
          {[
            { icon: ShieldCheck, label: 'Completely free', color: '#00d68f' },
            { icon: Star,        label: 'No credit card',  color: '#fbbf24' },
            { icon: Zap,         label: 'Instant access',  color: '#a78bfa' },
          ].map(({ icon: Icon, label, color }) => (
            <div key={label} className="flex items-center gap-1.5 text-[10px]" style={{ color }}>
              <Icon size={12} />
              {label}
            </div>
          ))}
        </div>
        <Link href="/login"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-[13px] font-bold text-white"
          style={{ background: 'linear-gradient(135deg,#4338ca,#7c3aed)', boxShadow: '0 0 30px rgba(99,102,241,0.4)', border: '1px solid rgba(99,102,241,0.5)' }}>
          Create Free Account
          <ChevronRight size={15} />
        </Link>
        <p className="text-[9px] text-[#4b5d73] mt-3">
          For personal use · Powered by Yahoo Finance, Finnhub, FRED, Cohere, Cerebras, Google AI
        </p>
      </section>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="border-t border-[#1a2235] text-center py-4 text-[9px] text-[#4b5d73]">
        Omniscient v2.0 — Free alternative to Bloomberg Terminal · Not financial advice
      </footer>
    </div>
  )
}
