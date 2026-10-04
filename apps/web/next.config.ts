import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const dataSource = process.env.HEDAX_DATA_SOURCE ?? 'api';
if (dataSource === 'fixtures' && process.env.NODE_ENV === 'production') {
  // Sample data is a development preview tool only (spec §1, §19).
  throw new Error('HEDAX_DATA_SOURCE=fixtures is not allowed in production builds');
}

const apiOrigin = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000/api/v1').replace(/\/api\/v1\/?$/, '');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  // Container images (infra/docker/Dockerfile) build a self-contained server; local `next start` is unchanged.
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' as const, outputFileTracingRoot: path.resolve(process.cwd(), '../..') } : {}),
  // The real-stack performance run builds into its own folder so the normal `.next` output is untouched.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@hedax/contracts', '@hedax/domain'],
  images: {
    localPatterns: [{ pathname: '/media/**' }],
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async rewrites() {
    // In production the reverse proxy serves /api/v1, /media and the WebSocket directly.
    return dataSource === 'api' ? [{ source: '/media/:path*', destination: `${apiOrigin}/media/:path*` }] : [];
  },
};

export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);
