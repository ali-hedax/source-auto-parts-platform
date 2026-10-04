import { defineConfig } from 'vitest/config';

/**
 * Unit tests (no database). Integration tests against a real PostgreSQL live in
 * test/integration and run with vitest.integration.config.ts.
 */
export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    pool: 'forks',
  },
});
