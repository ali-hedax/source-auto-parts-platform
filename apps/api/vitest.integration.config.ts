import { defineConfig } from 'vitest/config';

/**
 * Integration tests against a real PostgreSQL 18 started by global-setup
 * (native binaries, throwaway data directory, port 55433). They boot the
 * compiled API (`dist/`, so decorator metadata is exact) in-process.
 * Redis is intentionally unavailable: background steps the worker would run
 * (scan, import, reconcile, sweep) are invoked through the same services.
 *
 *   pnpm --filter @hedax/api build && pnpm --filter @hedax/api test:integration
 */
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['test/integration/global-setup.ts'],
    setupFiles: ['test/integration/env-setup.ts'],
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 180_000,
    sequence: { concurrent: false },
  },
});
