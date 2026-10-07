import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const dataSource = process.env.HEDAX_DATA_SOURCE ?? 'api';
if (dataSource === 'fixtures' && process.env.NODE_ENV === 'production') {
  // Sample data is a development preview tool only (spec §1, §19).
  throw new Error('HEDAX_DATA_SOURCE=fixtures is not allowed in production builds');
}

const apiOrigin = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000/api/v1').replace(/\/api\/v1\/?$/, '');

/**
 * Content-Security-Policy for production builds (`next dev` needs eval for fast refresh).
 * Next.js puts inline bootstrap scripts in every page; per-request nonces would make every
 * page dynamic and defeat the public page cache, so scripts are this origin plus inline:
 * no other origin, no eval, no plugins, no framing, forms only to this site.
 * Chat uses a WebSocket: its origin comes from PUBLIC_BASE_URL or NEXT_PUBLIC_WS_URL
 * ("same-origin" in the Docker setup; an absolute URL when the API is on another origin).
 */
function contentSecurityPolicy(): string {
  const connect = new Set<string>(["'self'"]);
  for (const value of [process.env.PUBLIC_BASE_URL, process.env.NEXT_PUBLIC_WS_URL]) {
    if (!value || !/^https?:\/\//.test(value)) continue;
    const url = new URL(value);
    connect.add(`${url.protocol === 'https:' ? 'wss' : 'ws'}://${url.host}`);
    connect.add(url.origin); // Socket.IO falls back to HTTP long-polling
  }
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${[...connect].join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Content-Security-Policy', value: contentSecurityPolicy() }] : []),
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
