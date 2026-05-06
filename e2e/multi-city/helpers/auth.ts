/**
 * Auth helpers for the multi-city E2E suite.
 *
 * loginAsAdmin  — logs into restaurant-admin (:3001) via the real login form.
 * loginAsOwner  — logs into restaurant-admin as a tenant owner.
 *
 * Both helpers assume `page.context().setDefaultNavigationTimeout` and
 * baseURL have been set in the Playwright project config.
 */

import { type Page } from '@playwright/test';
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_TENANT_OWNER_EMAIL,
  E2E_TENANT_OWNER_PASSWORD,
} from '../fixtures/seed';

/**
 * Log in as the platform-admin test user. Waits until the dashboard
 * root renders (URL starts with /dashboard).
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_ADMIN_EMAIL);
  await page.getByLabel('Parola').fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: /conectare|login|continuă/i }).click();
  await page.waitForURL((url) => url.pathname.startsWith('/dashboard'));
}

/**
 * Log in as the tenant owner test user. Waits for /dashboard redirect.
 * The caller is responsible for switching to the correct tenant context
 * if the owner has multiple tenants.
 */
export async function loginAsOwner(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_TENANT_OWNER_EMAIL);
  await page.getByLabel('Parola').fill(E2E_TENANT_OWNER_PASSWORD);
  await page.getByRole('button', { name: /conectare|login|continuă/i }).click();
  await page.waitForURL((url) => url.pathname.startsWith('/dashboard'));
}
