import type { Metadata } from 'next'
import './globals.css'
import { AppLayout }    from '@/components/layout/AppLayout'
import { AuthProvider }  from '@/context/AuthContext'
import { ThemeProvider } from '@/context/ThemeContext'

export const metadata: Metadata = {
  title:       'Omniscient — Market Intelligence Terminal',
  description: 'AI-powered market intelligence platform for solo traders',
  icons:       { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /* No hardcoded "dark" class — ThemeProvider writes data-theme + dark/light class */
    <html lang="en" suppressHydrationWarning>
      {/* Blocking script: runs before first paint so there is never a flash */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('omni-theme')||'system';var r=t==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):t;var h=document.documentElement;h.setAttribute('data-theme',r);h.classList.add(r);}catch(e){}})();` }} />
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <AppLayout>{children}</AppLayout>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
