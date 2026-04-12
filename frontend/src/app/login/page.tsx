'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Zap, Eye, EyeOff, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const { login, register } = useAuth()
  const router = useRouter()
  const [mode, setMode]       = useState<'login' | 'register'>('login')
  const [form, setForm]       = useState({ email: '', username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [showPw, setShowPw]   = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(form.username || form.email, form.password)
      } else {
        await register(form.email, form.username, form.password)
      }
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
         style={{ background: 'radial-gradient(ellipse at center, #0a1628 0%, #030b18 100%)' }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 0 20px rgba(99,102,241,0.4)' }}>
              <Zap size={20} className="text-white" />
            </div>
            <span className="text-2xl font-bold tracking-wider" style={{ color: '#a5b4fc' }}>OMNISCIENT</span>
          </div>
          <p className="text-[11px] text-muted tracking-widest uppercase">AI-Powered Market Intelligence Terminal</p>
        </div>

        {/* Card */}
        <div className="card p-6 space-y-5" style={{ background: 'rgba(10,22,40,0.9)', backdropFilter: 'blur(10px)' }}>
          {/* Mode toggle */}
          <div className="flex rounded-lg overflow-hidden border border-[#1a2235]">
            {(['login', 'register'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setError('') }}
                className="flex-1 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors"
                style={{
                  background: mode === m ? 'linear-gradient(135deg, #1e3a5f, #0f2744)' : 'transparent',
                  color: mode === m ? '#a5b4fc' : '#4a5578',
                }}>
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === 'register' && (
              <div>
                <label className="text-[10px] text-muted uppercase tracking-wider block mb-1">Email</label>
                <input className="input w-full" type="email" placeholder="you@example.com"
                  value={form.email} onChange={e => set('email', e.target.value)} required />
              </div>
            )}

            <div>
              <label className="text-[10px] text-muted uppercase tracking-wider block mb-1">
                {mode === 'login' ? 'Username or Email' : 'Username'}
              </label>
              <input className="input w-full" type="text"
                placeholder={mode === 'login' ? 'username or email' : 'choose a username'}
                value={form.username} onChange={e => set('username', e.target.value)} required />
            </div>

            <div>
              <label className="text-[10px] text-muted uppercase tracking-wider block mb-1">Password</label>
              <div className="relative">
                <input className="input w-full pr-10" type={showPw ? 'text' : 'password'}
                  placeholder={mode === 'register' ? 'min 6 characters' : '••••••••'}
                  value={form.password} onChange={e => set('password', e.target.value)}
                  minLength={6} required />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text-secondary">
                  {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-bear text-[11px] py-1.5 px-3 rounded"
                   style={{ background: 'rgba(255,77,109,0.1)', border: '1px solid rgba(255,77,109,0.2)' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="w-full btn btn-primary py-2.5 text-[12px] mt-1">
              {loading ? <Loader2 size={14} className="animate-spin mx-auto" /> :
                mode === 'login' ? 'Sign In' : 'Create Account & Continue'}
            </button>
          </form>

          <p className="text-center text-[10px] text-muted">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
              className="text-brand hover:text-text-primary transition-colors">
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        </div>

        <p className="text-center text-[9px] text-muted mt-4">
          For personal use only · Omniscient v2.0
        </p>
      </div>
    </div>
  )
}
