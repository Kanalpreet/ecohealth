import { defineConfig, devices } from '@playwright/test'

/*
 * End-to-end tests (e2e/). They run against the REAL local stack:
 * - the backend must already be running on http://localhost:8000 (see root CLAUDE.md);
 * - the Vite dev server is started here (or reused if it is already running on 5173).
 * Each test creates its own uniquely named account and deletes it at the end (DELETE /me).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
