import { fileURLToPath } from 'node:url'

// Coolify sets USE_REDIS_CACHE at build time; Vercel never does, so it keeps the
// built-in Data Cache with no config keys set at all.
const useRedisCache = process.env.USE_REDIS_CACHE === 'true'

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(useRedisCache
    ? {
        cacheHandler: fileURLToPath(new URL('./cache-handler.js', import.meta.url)),
        cacheMaxMemorySize: 0,
      }
    : {}),
  reactStrictMode: true,
  poweredByHeader: false,
  // SEO optimizations
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
  images: {
    unoptimized: true,
    minimumCacheTTL: 3600,
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 2000],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    qualities: [75, 100],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'iojoritxhpijprgkjfre.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  experimental: {
    optimizePackageImports: ['@/components/ui'],
    scrollRestoration: false,
    authInterrupts: true,
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  compress: true,
  generateEtags: true,
  pageExtensions: ['tsx', 'ts'],
  productionBrowserSourceMaps: false,
}

export default nextConfig
