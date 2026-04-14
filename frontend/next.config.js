/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  // Production hardening
  compress:        true,
  poweredByHeader: false,
  reactStrictMode: true,

  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    NEXT_PUBLIC_WS_URL:  process.env.NEXT_PUBLIC_WS_URL  || 'ws://localhost:8000',
  },

  // Tree-shake heavy icon/chart packages on every page
  experimental: {
    optimizePackageImports: ['lucide-react', 'lightweight-charts'],
  },

  // Compiler — drop console.* in production
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },

  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    return [
      { source: '/api/:path*', destination: `${apiBase}/api/:path*` },
    ]
  },

  // Raise stale-while-revalidate cache header for static assets
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ]
  },
}

module.exports = nextConfig
