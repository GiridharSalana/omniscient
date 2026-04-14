'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  MessageSquare, TrendingUp, Newspaper, BookOpen,
  Search, User, LogOut, X, ChevronRight, Zap,
  SlidersHorizontal, Briefcase, Bell, Target,
  Globe, Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'

// ── Navigation items — Opportunities is the primary entry ─────────
const NAV_PRIMARY = { href: '/opportunities', label: 'Opportunities', icon: Target }

const NAV_ITEMS = [
  { href: '/screener',  label: 'Screener',  icon: SlidersHorizontal },
  { href: '/portfolio', label: 'Portfolio', icon: Briefcase         },
  { href: '/momentum',  label: 'Momentum',  icon: TrendingUp        },
  { href: '/macro',     label: 'Macro',     icon: Globe             },
  { href: '/news',      label: 'News',      icon: Newspaper         },
  { href: '/briefing',  label: 'Briefing',  icon: Activity          },
  { href: '/chat',      label: 'AI Chat',   icon: MessageSquare     },
  { href: '/journal',   label: 'Journal',   icon: BookOpen          },
  { href: '/alerts',    label: 'Alerts',    icon: Bell              },
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
  const searchRef   = useRef<HTMLInputElement>(null)
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

  const isPrimary = path?.startsWith('/opportunities') || path?.startsWith('/dashboard')

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--bg-void)' }}>

      {/* ══ HEADER ═══════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 flex flex-col"
        style={{ background: 'linear-gradient(180deg, #050c1a 0%, #040a15 100%)', borderBottom: '1px solid #1a3050', boxShadow: '0 4px 32px rgba(0,0,0,0.7)' }}>

        {/* Top accent line — gradient */}
        <div className="h-[2px] w-full" style={{
          background: 'linear-gradient(90deg, transparent 0%, #7c3aed 20%, #a855f7 40%, #06b6d4 60%, #00d68f 80%, transparent 100%)'
        }} />

        {/* Header row */}
        <div className="flex items-center justify-between px-4 py-2 gap-4">

          {/* Logo */}
          <Link href="/opportunities" className="flex items-center gap-2.5 flex-shrink-0 group">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#5b21b6,#7c3aed)', boxShadow: '0 0 20px rgba(124,58,237,0.6)', border: '1px solid rgba(124,58,237,0.5)' }}>
              <Zap size={16} className="text-white" />
            </div>
            <div>
              <div className="text-[14px] font-bold tracking-tight text-white leading-none">OMNISCIENT</div>
              <div className="text-[8px] tracking-[0.25em] uppercase leading-none mt-0.5" style={{ color: '#4a6a8a' }}>
                Opportunities Terminal
              </div>
            </div>
          </Link>

          {/* Search */}
          {!isLoginPage && (
            <button onClick={() => { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 50) }}
              className="flex items-center gap-2.5 px-4 py-2 rounded-xl flex-1 max-w-md transition-all group"
              style={{ border: '1px solid #1a3050', background: 'rgba(7,15,29,0.9)' }}>
              <Search size={13} style={{ color: '#3d5a78' }} className="group-hover:text-brand transition-colors" />
              <span className="text-[12px] flex-1 text-left" style={{ color: '#3d5a78' }}>Search any stock or ticker…</span>
              <kbd className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: '#0b1729', border: '1px solid #1a3050', color: '#3d5a78' }}>⌘K</kbd>
            </button>
          )}

          {/* Right: Clock + Live + Auth */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden lg:flex flex-col items-end">
              <div className="num text-[15px] font-semibold text-white leading-none">{time}</div>
              <div className="text-[8px] uppercase tracking-wider mt-0.5" style={{ color: '#3d5a78' }}>{date} IST</div>
            </div>
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
              style={{ background: 'rgba(5,217,139,0.06)', border: '1px solid rgba(5,217,139,0.2)' }}>
              <div className="pulse-dot" />
              <span className="text-[10px] font-semibold" style={{ color: '#05d98b' }}>LIVE</span>
            </div>
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
          <div className="flex items-center gap-0.5 px-3 pb-1.5 overflow-x-auto"
            style={{ borderTop: '1px solid rgba(26,48,80,0.4)' }}>

            {/* Primary: Opportunities — styled prominently */}
            <Link href={NAV_PRIMARY.href}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-bold transition-all whitespace-nowrap mr-2 border',
                isPrimary ? 'text-white' : 'text-[#c4b5fd]'
              )}
              style={{
                background:   isPrimary ? 'linear-gradient(135deg,#6d28d9,#7c3aed)' : 'rgba(124,58,237,0.1)',
                borderColor:  isPrimary ? '#7c3aed' : 'rgba(124,58,237,0.35)',
                boxShadow:    isPrimary ? '0 0 18px rgba(124,58,237,0.5)' : '0 0 8px rgba(124,58,237,0.15)',
              }}>
              <NAV_PRIMARY.icon size={13} />
              {NAV_PRIMARY.label}
            </Link>

            {/* Divider */}
            <div className="w-px h-5 bg-[#1a3050] mr-1 flex-shrink-0" />

            {/* Secondary items */}
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = path?.startsWith(href)
              return (
                <Link key={href} href={href}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all whitespace-nowrap border',
                    active
                      ? 'text-[#93c5fd] bg-[rgba(59,130,246,0.12)] border-[rgba(59,130,246,0.3)]'
                      : 'text-[#3d5a78] hover:text-[#8faac5] hover:bg-[rgba(11,23,40,0.8)] border-transparent'
                  )}>
                  <Icon size={12} />
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
          style={{ background: 'rgba(2,6,14,0.92)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-xl animate-fade-in rounded-2xl overflow-hidden"
            style={{ background: '#060e1c', border: '1px solid #1a3050', boxShadow: '0 32px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(124,58,237,0.2)' }}>

            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1a2235]">
              <Search size={16} style={{ color: '#7c3aed' }} className="flex-shrink-0" />
              <input ref={searchRef} value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Search stocks: AAPL, RELIANCE.NS, INFY.NS…"
                className="flex-1 bg-transparent text-[14px] text-white placeholder-[#3d5a78] outline-none"
                autoComplete="off" />
              {searching && <div className="w-4 h-4 rounded-full border-2 border-[#7c3aed] border-t-transparent animate-spin" />}
              <button onClick={() => setSearchOpen(false)} style={{ color: '#3d5a78' }} className="hover:text-white transition-colors">
                <X size={15} />
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="py-1.5 max-h-80 overflow-y-auto">
                {searchResults.map(r => (
                  <button key={r.symbol} onClick={() => goToStock(r.symbol)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-[#0b1729] transition-colors text-left group">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-[13px] font-bold"
                      style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)', color: '#a78bfa' }}>
                      {r.symbol.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-[13px]">{r.symbol}</span>
                        <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{ background: '#0b1729', border: '1px solid #1a3050', color: '#3d5a78' }}>{r.type}</span>
                      </div>
                      <div className="text-[11px] truncate mt-0.5" style={{ color: '#3d5a78' }}>{r.name}</div>
                    </div>
                    <ChevronRight size={13} style={{ color: '#3d5a78' }} className="flex-shrink-0 group-hover:text-brand transition-colors" />
                  </button>
                ))}
              </div>
            )}

            {searchQuery && !searching && !searchResults.length && (
              <div className="px-5 py-10 text-center text-[12px]" style={{ color: '#3d5a78' }}>
                No results for <span className="text-white">"{searchQuery}"</span>
              </div>
            )}

            {!searchQuery && (
              <div className="px-5 py-4">
                <div className="text-[9px] uppercase tracking-widest text-muted mb-2 font-semibold">Quick Access</div>
                <div className="flex flex-wrap gap-2">
                  {['AAPL','NVDA','MSFT','RELIANCE.NS','HDFCBANK.NS','TCS.NS','INFY.NS','TSLA'].map(s => (
                    <button key={s} onClick={() => handleSearch(s)}
                      className="text-[11px] px-3 py-1.5 rounded-lg transition-all hover:border-brand"
                      style={{ border: '1px solid #1a3050', background: '#0b1729', color: '#8faac5' }}>
                      {s}
                    </button>
                  ))}
                </div>
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
          style={{ background: '#020810', borderColor: '#0d1c30', color: '#3d5a78', fontSize: 9 }}>
          <span>Omniscient — Opportunities Terminal · Free tier AI routing active</span>
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
