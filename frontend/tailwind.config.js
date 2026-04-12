/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Deep navy terminal palette ─────────────────────────
        surface: {
          base:   '#050c1a',   // page bg — deep navy-black
          card:   '#0a1628',   // card surface
          raised: '#0f1f38',   // elevated tiles / inner cards
          border: '#1a3050',   // visible blue-navy border
          hover:  '#162843',   // hover state
          active: '#1e3a5f',   // pressed / selected
        },
        // ── Brand ──────────────────────────────────────────────
        brand: {
          DEFAULT: '#6366f1',  // indigo
          light:   '#818cf8',
          dim:     '#312e81',
          glow:    'rgba(99,102,241,0.2)',
        },
        // ── Market data colors (TradingView-style) ─────────────
        bull:  '#00d68f',   // teal-green — up / bullish
        'bull-dim': '#003d28',
        bear:  '#ff4d6d',   // rose-red — down / bearish
        'bear-dim': '#3d0016',
        warn:  '#fbbf24',   // amber — neutral / caution
        'warn-dim': '#3d2f00',
        info:  '#38bdf8',   // sky-blue — informational
        'info-dim': '#003d5c',
        // ── Text hierarchy ─────────────────────────────────────
        muted: '#4b5d73',
        'text-primary':   '#eef2ff',   // near-white with blue tint
        'text-secondary': '#8da3bf',   // blue-grey
        // ── Sentiment aliases ──────────────────────────────────
        'sentiment-bull':    '#00d68f',
        'sentiment-bear':    '#ff4d6d',
        'sentiment-neutral': '#fbbf24',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'card-gradient':    'linear-gradient(135deg, #0a1628 0%, #0d1e3a 100%)',
        'bull-gradient':    'linear-gradient(135deg, #003d28 0%, #004d32 100%)',
        'bear-gradient':    'linear-gradient(135deg, #3d0016 0%, #4d001d 100%)',
        'brand-gradient':   'linear-gradient(135deg, #312e81 0%, #4338ca 100%)',
        'header-gradient':  'linear-gradient(90deg, #050c1a 0%, #071224 50%, #050c1a 100%)',
      },
      boxShadow: {
        'card':    '0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(26,48,80,0.8)',
        'card-md': '0 4px 12px rgba(0,0,0,0.5), 0 0 0 1px rgba(26,48,80,0.8)',
        'bull':    '0 0 12px rgba(0,214,143,0.15)',
        'bear':    '0 0 12px rgba(255,77,109,0.15)',
        'brand':   '0 0 16px rgba(99,102,241,0.2)',
        'inset':   'inset 0 1px 0 rgba(255,255,255,0.04)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in':    'fadeIn 0.25s ease-out',
        'glow-bull':  'glowBull 2s ease-in-out infinite alternate',
        'glow-bear':  'glowBear 2s ease-in-out infinite alternate',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glowBull: {
          '0%':   { boxShadow: '0 0 4px rgba(0,214,143,0.1)' },
          '100%': { boxShadow: '0 0 12px rgba(0,214,143,0.3)' },
        },
        glowBear: {
          '0%':   { boxShadow: '0 0 4px rgba(255,77,109,0.1)' },
          '100%': { boxShadow: '0 0 12px rgba(255,77,109,0.3)' },
        },
      },
    },
  },
  plugins: [],
}
