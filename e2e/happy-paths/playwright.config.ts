/**
 * Playwright config for the happy-path E2E suite (Wave 4-C, extended in 4-A).
 *
 * End-to-end flows in scope:
 *   - courier-happy-path.spec.ts          → restaurant-courier (port 3002 / E2E_COURIER_BASE_URL)
 *   - storefront-happy-path.spec.ts       → restaurant-web    (port 3000 / E2E_WEB_BASE_URL)
 *   - customer-payment-sandbox.spec.ts    → restaurant-web    (Wave 4-A; Netopia/Viva sandbox shape)
 *
 * Most assertions in these specs are currently behind `test.fixme()`
 * because they require a real Supabase stack (auth users, seed orders,
 * cleanup). The non-fixme assertions still exercise the public surfaces
 * (login page render, storefront city → tenant navigation) and are safe
 * to run against any deployed environment.
 *
 * Env precedence (last wins):
 *   .env.test  — committed, non-secret (base URLs, test emails)
 *   .env.local — gitignored, secrets (Supabase keys, passwords)
 */

import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

const DIR = path.resolve(__dirname);
loadEnv({ path: path.join(DIR, '.env.test') });
loadEnv({ path: path.join(DIR, '.env.local'), override: true });

const WEB_BASE_URL = process.env.E2E_WEB_BASE_URL ?? 'http://localhost:3000';
const COURIER_BASE_URL = process.env.E2E_COURIER_BASE_URL ?? 'http://localhost:3002';

const RUN_WEB_LOCAL = !process.env.E2E_WEB_BASE_URL;
const RUN_COURIER_LOCAL = !process.env.E2E_COURIER_BASE_URL;

export default defineConfig({
  testDir: DIR,
  testMatch: '**/*.spec.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',

  projects: [
    {
      name: 'courier-happy-path',
      testMatch: '**/courier-happy-path.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: COURIER_BASE_URL,
        locale: 'ro-RO',
        timezoneId: 'Europe/Bucharest',
      },
    },
    {
      name: 'storefront-happy-path',
      testMatch: '**/storefront-happy-path.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: WEB_BASE_URL,
        locale: 'ro-RO',
        timezoneId: 'Europe/Bucharest',
      },
    },
    {
      // Wave 4-A — Netopia/Viva sandbox URL-shape coverage. Same target as
      // storefront-happy-path; kept as a distinct project so it can be run
      // in isolation (`--project customer-payment-sandbox`). All specs are
      // currently `test.fixme()` pending demo-tenant seed.
      name: 'customer-payment-sandbox',
      testMatch: '**/customer-payment-sandbox.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: WEB_BASE_URL,
        locale: 'ro-RO',
        timezoneId: 'Europe/Bucharest',
      },
    },
  ],

  webServer: [
    ...(RUN_WEB_LOCAL
      ? [
          {
            command: 'pnpm --filter @hir/restaurant-web dev',
            url: WEB_BASE_URL,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            cwd: path.resolve(DIR, '../../'),
          },
        ]
      : []),
    ...(RUN_COURIER_LOCAL
      ? [
          {
            command: 'pnpm --filter @hir/restaurant-courier dev',
            url: COURIER_BASE_URL,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            cwd: path.resolve(DIR, '../../'),
          },
        ]
      : []),
  ],
});
