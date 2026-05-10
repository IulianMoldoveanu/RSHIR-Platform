import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

// Load .env.test first (committed, with test-only public values), then
// .env.local (gitignored, secrets). Last load wins on conflict.
loadEnv({ path: path.resolve(__dirname, '.env.test') });
loadEnv({ path: path.resolve(__dirname, '.env.local'), override: true });

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3002';
const RUN_LOCAL_DEV = !process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: require.resolve('./tests/e2e/global-setup'),
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'ro-RO',
    timezoneId: 'Europe/Bucharest',
    viewport: { width: 390, height: 844 },
    permissions: ['geolocation'],
    geolocation: { latitude: 45.6427, longitude: 25.5887 },
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: RUN_LOCAL_DEV
    ? {
        command: 'pnpm dev',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});
