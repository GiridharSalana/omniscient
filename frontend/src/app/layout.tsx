import type { Metadata } from 'next'
import './globals.css'
import { AppLayout } from '@/components/layout/AppLayout'
import { AuthProvider } from '@/context/AuthContext'

export const metadata: Metadata = {
  title:       'Omniscient — Market Intelligence Terminal',
  description: 'AI-powered market intelligence platform for solo traders',
  icons:       { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <AuthProvider>
          <AppLayout>{children}</AppLayout>
        </AuthProvider>
      </body>
    </html>
  )
}
