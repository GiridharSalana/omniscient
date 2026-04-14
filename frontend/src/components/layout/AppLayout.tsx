'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, MessageSquare, TrendingUp,
  Newspaper, BookOpen, Activity, Globe,
  Search, User, LogOut, X, ChevronRight,
  SlidersHorizontal, Briefcase, Bell, Zap, Target,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Opportunities', icon: Target,           primary: true  },
  { href: '/screener',  label: 'Screener',      icon: SlidersHorizontal, primary: false },
  { href: '/portfolio', label: 'Portfolio',     icon: Briefcase,         primary: false },
  { href: '/momentum',  label: 'Momentum',      icon: TrendingUp,        primary: false },
  { href: '/macro',     label: 'Macro',         icon: Globe,             primary: false },
  { href: '/news',      label: 'News',          icon: Newspaper,         primary: false },
  { href: '/briefing',  label: 'Briefing',      icon: Activity,          primary: false },
  { href: '/chat',      label: 'AI Chat',       icon: MessageSquare,     primary: false },
  { href: '/journal',   label: 'Journal',       icon: BookOpen,          primary: false },
  { href: '/alerts',    label: 'Alerts',        icon: Bell,              primary: false },
]

interface SearchResult { symbol: string; name: string; type: string }

export function AppLayout({ children }: { children: React.ReactNode }) {
  const path   = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()

  const [time, setTime] = useState('')
  const [date, setDate] = useState('')

  const [searchOpen,    setSearchOpen]    = useState(false)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching,     setSearching]     = useState(false)
  const searchRef  = useRef<HTMLInputElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }))
      setDate(now.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' }))
    }
    tick(); const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 80) }
      if (e.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q)
    clearTimeout(searchTimer.current)
    if (!q.trim()) { setSearchResults([]); return }
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      try { const d = await api.stock.search(q) as SearchResult[]; setSearchResults(d) }
      catch { setSearchResults([]) }
      finally { setSearching(false) }
    }, 350)
  }, [])

  const goToStock = (symbol: string) => {
    setSearchOpen(false); setSearchQuery(''); setSearchResults([])
    router.push(`/stock/${symbol}`)
  }

  const isLoginPage   = path === '/login'
  const isLandingPage = path === '/'

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--bg-void)' }}>

      {/* ══ HEADER ═══════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 flex flex-col"
        style={{ background: 'linear-gradient(180deg, #060d1c 0%, #050b18 100%)', borderBottom: '1px solid #1a3050', boxShadow: '0 4px 24px rgba(0,0,0,0.6)' }}>

        {/* Top accent line */}
        <div className="h-0.5 w-full" style={{
          background: 'linear-gradient(90deg, transparent 0%, #7c3aed 30%, #05d98b 70%, transparent 100%)'
        }} />

        {/* Header row */}
        <div className="flex items-center justify-between px-4 py-2 gap-4">

          {/* Left: Logo */}
          <Link href="/dashboard" className="flex items-center gap-2.5 flex-shrink-0 group">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#5b21b6,#7c3aed)', boxShadow: '0 0 16px rgba(124,58,237,0.5)', border: '1px solid rgba(124,58,237,0.4)' }}>
              <Zap size={16} className="text-white" />
            </div>
            <div>
              <div className="text-[14px] font-bold tracking-tight text-white leading-none">OMNISCIENT</div>
              <div className="text-[9px] tracking-[0.2em] uppercase leading-none mt-0.5" style={{ color: '#4a6a8a' }}>Global Opportunities</div>
            </div>
          </Link>

          {/* Center: Search */}
          {!isLoginPage && (
            <button onClick={() => { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 50) }}
              className="flex items-center gap-2.5 px-4 py-2 rounded-lg flex-1 max-w-xs transition-all"
              style={{ border: '1px solid #1a3050', background: 'rgba(7,15,29,0.9)' }}>
              <Search size={13} style={{ color: '#3d5a78' }} />
              <span className="text-[12px] flex-1 text-left" style={{ color: '#3d5a78' }}>Search stocks…</span>
              <kbd className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: '#0b1729', border: '1px solid #1a3050', color: '#3d5a78' }}>⌘K</kbd>
            </button>
          )}

          {/* Right: Clock + Status + Auth */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* IST Clock */}
            <div className="hidden lg:flex flex-col items-end">
              <div className="num text-[15px] font-semibold text-white leading-none">{time}</div>
              <div className="text-[9px] uppercase tracking-wider mt-0.5" style={{ color: '#3d5a78' }}>{date} IST</div>
            </div>

            {/* Market status */}
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md"
              style={{ background: 'rgba(5,217,139,0.06)', border: '1px solid rgba(5,217,139,0.2)' }}>
              <div className="pulse-dot" />
              <span className="text-[10px] font-semibold" style={{ color: '#05d98b' }}>LIVE</span>
            </div>

            {/* Auth */}
            {!isLoginPage && !isLandingPage && (
              user ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold hidden xl:inline" style={{ color: '#a78bfa' }}>{user.username}</span>
                  <button onClick={logout} className="nav-item !px-2 !py-2" title="Sign out"><LogOut size={14} /></button>
                </div>
              ) : (
                <Link href="/login" className="btn btn-primary !py-2 !px-4 !text-[12px] gap-1.5">
                  <User size={13} /> Sign In
                </Link>
              )
            )}
          </div>
        </div>

        {/* Navigation row */}
        {!isLoginPage && !isLandingPage && (
          <div className="flex items-center gap-0.5 px-3 pb-1 overflow-x-auto"
            style={{ borderTop: '1px solid rgba(26,48,80,0.5)' }}>
            {NAV_ITEMS.map(({ href, label, icon: Icon, primary }) => {
              const active = path?.startsWith(href)
              if (primary) {
                return (
                  <Link key={href} href={href}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-bold transition-all whitespace-nowrap mr-1',
                      active
                        ? 'text-white border'
                        : 'text-[#c4b5fd] hover:text-white border'
                    )}
                    style={{
                      background: active
                        ? 'linear-gradient(135deg, #6d28d9, #7c3aed)'
                        : 'rgba(124,58,237,0.12)',
                      borderColor: active ? '#7c3aed' : 'rgba(124,58,237,0.4)',
                      boxShadow: active ? '0 0 14px rgba(124,58,237,0.4)' : '0 0 8px rgba(124,58,237,0.15)',
                    }}>
                    <Icon size={13} />
                    {label}
                  </Link>
                )
              }
              return (
                <Link key={href} href={href}
                  className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all whitespace-nowrap',
                    active
                      ? 'text-[#c4b5fd] bg-[rgba(124,58,237,0.15)] border border-[rgba(124,58,237,0.35)]'
                      : 'text-[#3d5a78] hover:text-[#8faac5] hover:bg-[rgba(11,23,40,0.8)] border border-transparent')}>
                  <Icon size={13} />
                  {label}
                </Link>
              )
            })}
          </div>
        )}
      </header>

      {/* ══ SEARCH MODAL ═════════════════════════════════════════════ */}
      {searchOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 px-4"
          onClick={e => e.target === e.currentTarget && setSearchOpen(false)}
          style={{ background: 'rgba(2,8,16,0.88)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-lg animate-fade-in rounded-xl overflow-hidden"
            style={{ background: '#07111f', border: '1px solid #1a3050', boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,58,237,0.15)' }}>

            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#1a2235]">
              <Search size={16} style={{ color: '#3d5a78' }} className="flex-shrink-0" />
              <input ref={searchRef} value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Search any stock ticker or company name…"
                className="flex-1 bg-transparent text-[13px] text-white placeholder-[#3d5a78] outline-none"
                autoComplete="off" />
              {searching && <div className="w-4 h-4 rounded-full border-2 border-[#7c3aed] border-t-transparent animate-spin flex-shrink-0" />}
              <button onClick={() => setSearchOpen(false)} style={{ color: '#3d5a78' }} className="hover:text-white transition-colors">
                <X size={15} />
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="py-1 max-h-80 overflow-y-auto">
                {searchResults.map(r => (
                  <button key={r.symbol} onClick={() => goToStock(r.symbol)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#0b1729] transition-colors text-left">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-[12px] font-bold"
                      style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)', color: '#a78bfa' }}>
                      {r.symbol.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-[13px]">{r.symbol}</span>
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{ background: '#0b1729', border: '1px solid #1a3050', color: '#3d5a78' }}>{r.type}</span>
                      </div>
                      <div className="text-[11px] truncate mt-0.5" style={{ color: '#3d5a78' }}>{r.name}</div>
                    </div>
                    <ChevronRight size={13} style={{ color: '#3d5a78' }} className="flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {searchQuery && !searching && !searchResults.length && (
              <div className="px-4 py-8 text-center text-[12px]" style={{ color: '#3d5a78' }}>
                No results for <span className="text-white">"{searchQuery}"</span> — try AAPL, RELIANCE.NS, INFY.NS
              </div>
            )}

            {!searchQuery && (
              <div className="px-4 py-3 flex flex-wrap gap-2">
                <div className="w-full text-[10px] mb-1" style={{ color: '#3d5a78' }}>POPULAR</div>
                {['AAPL','RELIANCE.NS','INFY.NS','TCS.NS','NVDA','TSLA','HDFCBANK.NS'].map(s => (
                  <button key={s} onClick={() => handleSearch(s)}
                    className="text-[11px] px-3 py-1 rounded-md transition-all"
                    style={{ border: '1px solid #1a3050', background: '#0b1729', color: '#8faac5' }}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ MAIN CONTENT ══════════════════════════════════════════════ */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>

      {/* ══ STATUS BAR ════════════════════════════════════════════════ */}
      {!isLandingPage && !isLoginPage && (
        <footer className="flex items-center justify-between px-4 py-1 border-t"
          style={{ background: '#030910', borderColor: '#0e1e35', color: '#3d5a78', fontSize: 10 }}>
          <span>Omniscient v3.0 — Free tier AI routing active</span>
          <div className="flex items-center gap-4">
            {['API', 'DB', 'Cache'].map(s => (
              <span key={s} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#05d98b', boxShadow: '0 0 4px rgba(5,217,139,0.6)' }} />
                {s}
              </span>
            ))}
          </div>
        </footer>
      )}
    </div>
  )
}
