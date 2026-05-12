/**
 * Production smoke E2E — runs against live Vercel deployments.
 *
 * Three apps in scope:
 *   - restaurant-web    (marketing + storefront)
 *   - restaurant-admin  (tenant dashboard login surface)
 *   - restaurant-courier (courier login surface)
 *
 * No dev servers. No DB writes. Pure read-only navigation that asserts
 * the critical paths every user touches are alive. ~30-60s end-to-end.
 *
 * Env (overridable; defaults point at prod):
 *   E2E_WEB_BASE_URL      default: https://hirforyou.ro
 *   E2E_ADMIN_BASE_URL    default: https://hir-restaurant-admin.vercel.app
 *   E2E_COURIER_BASE_URL  default: https://hir-restaurant-courier.vercel.app
 *   E2E_TENANT_STOREFRONT default: https://hir-restaurant-web.vercel.app/foisorul-a
 */

import { defineConfig, devices } from '@playwright/test';

const WEB = process.env.E2E_WEB_BASE_URL ?? 'https://hirforyou.ro';
const ADMIN = process.env.E2E_ADMIN_BASE_URL ?? 'https://hir-restaurant-admin.vercel.app';
const COURIER = process.env.E2E_COURIER_BASE_URL ?? 'https://hir-restaurant-courier.vercel.app';

export default defineConfig({
  testDir: __dirname,
  testMatch: '**/*.spec.ts',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',

  use: {
    locale: 'ro-RO',
    timezoneId: 'Europe/Bucharest',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // No realtime subs on these surfaces — networkidle is safe.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'web',
      testMatch: '**/web.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: WEB },
    },
    {
      name: 'admin',
      testMatch: '**/admin.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: ADMIN },
    },
    {
      name: 'courier',
      testMatch: '**/courier.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: COURIER },
    },
    {
      name: 'storefront',
      testMatch: '**/storefront.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.E2E_TENANT_STOREFRONT ?? `${WEB}/foisorul-a`,
      },
    },
  ],
});
