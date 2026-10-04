import { defineConfig, devices } from '@playwright/test';

/**
 * Browser checks of the web app connected to the REAL API and PostgreSQL
 * (no fixtures). Start the stack first (see docs/TEST_REPORT.md):
 *   API with APP_ENV=development, PAYMENT_PROVIDER=simulator, SMS_PROVIDER=dev-log,
 *   PUBLIC_BASE_URL=<web origin>; web with HEDAX_DATA_SOURCE=api.
 * Then: E2E_REAL_BASE_URL=http://localhost:3200 npx playwright test -c playwright.real.config.ts
 */
const channel = process.env.PW_CHANNEL ?? 'msedge';

export default defineConfig({
  testDir: './e2e-real',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_REAL_BASE_URL ?? 'http://localhost:3200',
    channel,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], channel } }],
});
