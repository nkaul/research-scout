import { defineConfig, devices } from '../../frontend/node_modules/@playwright/test';
import path from 'node:path';

const frontend = path.resolve(__dirname, '../../frontend');

export default defineConfig({
  testDir: __dirname,
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  timeout: 35_000,
  expect: { timeout: 8000 },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  outputDir: path.join(__dirname, 'artifacts', 'test-results'),
  use: {
    baseURL: process.env.SCOUT_BROWSER_URL || 'http://127.0.0.1:3100',
    viewport: { width: 1440, height: 1080 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
    // This machine's headless-shell build does not produce animation frames.
    // Full Chromium passes an isolated RAF/click check and exercises real hit testing.
    channel: 'chromium',
    launchOptions: { args: ['--disable-gpu'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.SCOUT_BROWSER_EXTERNAL_SERVER ? undefined : {
    command: 'npm run dev',
    cwd: frontend,
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
