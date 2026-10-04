import { defineConfig, devices } from '@playwright/test';

/**
 * UI acceptance checks against the development preview (labelled sample data,
 * no PostgreSQL/Redis needed). Uses the locally installed Edge/Chrome because
 * Playwright's browser CDN may be unreachable (set PW_CHANNEL=chrome to switch).
 * Flows that need the real backend are covered by API integration tests.
 */
const port = Number(process.env.E2E_PORT ?? 3100);
const channel = process.env.PW_CHANNEL ?? 'msedge';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://localhost:${port}`,
    channel,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], channel } }],
  webServer: {
    command: `node scripts/with-fixtures.mjs next dev --port ${port}`,
    url: `http://localhost:${port}/fa`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
