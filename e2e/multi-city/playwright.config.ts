/**
 * Playwright config for the multi-city E2E suite.
 *
 * Covers two Next.js apps:
 *   - restaurant-web  (port 3000) — /orase/* storefront + sitemap
 *   - restaurant-admin (port 3001) — /dashboard/admin/tenants + /fleet-managers + onboarding
 *
 * Env precedence (last wins):
 *   .env.test  — committed, non-secret (base URLs, test emails)
 *   .env.local — gitignored, secrets (Supabase keys, passwords)
 *
 * Run all:    pnpm --filter @hir/e2e-multi-city test:e2e:multi-city
 * Run subset: pnpm --filter @hir/e2e-multi-city test:e2e:multi-city --grep "storefront"
 */

import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

const DIR = path.resolve(__dirname);
loadEnv({ path: path.join(DIR, '.env.test') });
loadEnv({ path: path.join(DIR, '.env.local'), override: true });

const WEB_BASE_URL = process.env.E2E_WEB_BASE_URL ?? 'http://localhost:3000';
const ADMIN_BASE_URL = process.env.E2E_ADMIN_BASE_URL ?? 'http://localhost:3001';

// When a pre-deployed URL is provided, skip local dev server.
const RUN_WEB_LOCAL = !process.env.E2E_WEB_BASE_URL;
const RUN_ADMIN_LOCAL = !process.env.E2E_ADMIN_BASE_URL;

export default defineConfig({
  testDir: DIR,
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',

  projects: [
    // Storefront (restaurant-web) tests
    {
      name: 'storefront',
      testMatch: '**/storefront-city-landing.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: WEB_BASE_URL,
        locale: 'ro-RO',
        timezoneId: 'Europe/Bucharest',
      },
    },
    {
      name: 'sitemap',
      testMatch: '**/sitemap.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: WEB_BASE_URL,
        locale: 'ro-RO',
        timezoneId: 'Europe/Bucharest',
      },
    },
    // Admin (restaurant-admin) tests
    {
      name: 'admin-tenant-filter',
      testMatch: '**/admin-tenant-filter.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: ADMIN_BASE_URL,
        locale: 'ro-RO',
        timezoneId: 'Europe/Bucharest',
      },
    },
    {
      name: 'fm-by-city',
      testMatch: '**/fm-by-city.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: ADMIN_BASE_URL,
        locale: 'ro-RO',
        timezoneId: 'Europe/Bucharest',
      },
    },
    {
      name: 'onboarding-city-step',
      testMatch: '**/onboarding-city-step.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: ADMIN_BASE_URL,
        locale: 'ro-RO',
        timezoneId: 'Europe/Bucharest',
      },
    },
    {
      name: 'inventory-recipe-link',
      testMatch: '**/inventory-recipe-link.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: ADMIN_BASE_URL,
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
    ...(RUN_ADMIN_LOCAL
      ? [
          {
            command: 'pnpm --filter @hir/restaurant-admin dev',
            url: ADMIN_BASE_URL,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            cwd: path.resolve(DIR, '../../'),
          },
        ]
      : []),
  ],
});
