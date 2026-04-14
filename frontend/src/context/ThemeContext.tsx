'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

export type ThemeMode = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

interface ThemeCtx {
  theme:    ThemeMode
  resolved: ResolvedTheme
  setTheme: (t: ThemeMode) => void
}

const Ctx = createContext<ThemeCtx>({
  theme: 'system', resolved: 'dark', setTheme: () => {},
})

function getResolved(mode: ThemeMode): ResolvedTheme {
  if (mode !== 'system') return mode
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement
  root.setAttribute('data-theme', resolved)
  // Keep Tailwind darkMode:'class' in sync
  if (resolved === 'dark') {
    root.classList.add('dark')
    root.classList.remove('light')
  } else {
    root.classList.add('light')
    root.classList.remove('dark')
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme,    setThemeState] = useState<ThemeMode>('system')
  const [resolved, setResolved]   = useState<ResolvedTheme>('dark')

  // Read stored preference once on mount
  useEffect(() => {
    const stored = (localStorage.getItem('omni-theme') as ThemeMode | null) ?? 'system'
    const res = getResolved(stored)
    setThemeState(stored)
    setResolved(res)
    applyTheme(res)
  }, [])

  // Re-apply whenever theme changes + watch system preference
  useEffect(() => {
    const res = getResolved(theme)
    setResolved(res)
    applyTheme(res)

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: light)')
      const handler = () => {
        const r = mq.matches ? 'light' : 'dark'
        setResolved(r)
        applyTheme(r)
      }
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])

  const setTheme = useCallback((t: ThemeMode) => {
    localStorage.setItem('omni-theme', t)
    setThemeState(t)
  }, [])

  return <Ctx.Provider value={{ theme, resolved, setTheme }}>{children}</Ctx.Provider>
}

export const useTheme = () => useContext(Ctx)
