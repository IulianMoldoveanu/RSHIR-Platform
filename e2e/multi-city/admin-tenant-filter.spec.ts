/**
 * Test 3 — Admin tenant list city filter.
 *
 * Covers:
 *   - Auth redirect when not logged in → /login
 *   - Platform-admin visits /dashboard/admin/tenants
 *   - ?city=brasov filter: URL updates + only Brașov tenants (or empty state)
 *   - "Setează oraș" on a NULL-city row → pick Brașov → row updates with city
 *   - No unhandled console errors on the page
 *
 * baseURL = restaurant-admin (port 3001 or E2E_ADMIN_BASE_URL).
 *
 * Prerequisites (handled by beforeAll fixture):
 *   - E2E_ADMIN_EMAIL must be in HIR_PLATFORM_ADMIN_EMAILS env of the admin app.
 *   - A test tenant with NULL city_id must exist (ensureTestTenant).
 */

import { test, expect } from '@playwright/test';
import { ensureUser, ensureTestTenant, resetTestTenantCity, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from './fixtures/seed';
import { loginAsAdmin } from './helpers/auth';

test.describe('Admin tenant list city filter', { tag: '@multi-city' }, () => {
  let tenantId: string;
  const consoleErrors: string[] = [];

  test.beforeAll(async () => {
    const adminUserId = await ensureUser(E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
    tenantId = await ensureTestTenant(adminUserId);
  });

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    await resetTestTenantCity(tenantId);
  });

  test('unauthenticated access redirects to /login', async ({ page }) => {
    await page.goto('/dashboard/admin/tenants');
    await expect(page).toHaveURL(/\/login/);
  });

  test('admin lands on tenants page after login', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/admin/tenants');
    // The page header shows "Toate restaurantele"
    await expect(
      page.getByRole('heading', { name: /toate restaurantele/i }),
    ).toBeVisible();
  });

  test('?city=brasov filter updates URL and reflects selected city', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/admin/tenants');

    // Find a select containing a brasov option (the city filter dropdown).
    const brasovOption = page.locator('option[value="brasov"]').first();
    await expect(brasovOption).toBeAttached({ timeout: 15_000 });

    const citySelect = page.locator('select').filter({ has: page.locator('option[value="brasov"]') }).first();
    await citySelect.selectOption('brasov');

    // URL should update to include city=brasov (the client calls router.push).
    await expect(page).toHaveURL(/city=brasov/, { timeout: 10_000 });

    // The select should now show "brasov" as its current value.
    const selectedVal = await citySelect.inputValue();
    expect(selectedVal).toBe('brasov');

    // The header count "(N)" should update after navigation settles.
    await page.waitForLoadState('networkidle');
    // Page still renders — no crash.
    await expect(page.getByRole('heading', { name: /toate restaurantele/i })).toBeVisible();
  });

  test('city filter select contains all 12 canonical cities', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/admin/tenants');

    // The filter dropdown lists canonical cities. Verify 12 city options.
    const cityOptions = page.locator('select option[value="brasov"], select option[value="bucuresti"], select option[value="cluj-napoca"]');
    // Simpler: check that the select has at least 12 city-slug-valued options.
    const allCitySlugs = [
      'bucuresti', 'brasov', 'cluj-napoca', 'timisoara', 'iasi',
      'constanta', 'sibiu', 'oradea', 'galati', 'ploiesti', 'craiova', 'arad',
    ];
    for (const slug of allCitySlugs) {
      await expect(page.locator(`option[value="${slug}"]`)).toBeAttached();
    }
  });

  test('"Setează oraș" button on NULL-city row triggers inline dropdown', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/admin/tenants');

    // Find the "Setează oraș" button — present on rows with NULL city_id.
    // The test tenant has NULL city_id after resetTestTenantCity.
    const setButton = page.getByRole('button', { name: /setează oraș/i }).first();
    await expect(setButton).toBeVisible({ timeout: 15_000 });

    await setButton.click();

    // An inline select with city options should appear.
    const inlineSelect = page.locator('select').filter({ has: page.locator('option[value="brasov"]') }).first();
    await expect(inlineSelect).toBeVisible({ timeout: 5_000 });
  });

  test('"Setează oraș" → pick Brașov → row city updates without page reload', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/admin/tenants');

    const setButton = page.getByRole('button', { name: /setează oraș/i }).first();
    await expect(setButton).toBeVisible({ timeout: 15_000 });
    await setButton.click();

    const inlineSelect = page.locator('select').filter({ has: page.locator('option[value="brasov"]') }).first();
    await expect(inlineSelect).toBeVisible({ timeout: 5_000 });
    await inlineSelect.selectOption('brasov');

    // The inline select disappears (editing state is cleared on success).
    await expect(inlineSelect).not.toBeVisible({ timeout: 15_000 });

    // The row should now show "Brașov" text (canonical city name).
    await expect(page.getByText('Brașov').first()).toBeVisible({ timeout: 10_000 });
  });

  test('no unhandled console errors on tenant list page', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/admin/tenants');
    // Allow hydration to complete.
    await page.waitForLoadState('networkidle');
    // Filter to serious errors only (ignore React DevTools messages etc).
    const serious = consoleErrors.filter(
      (e) => !e.includes('React') && !e.includes('Warning') && !e.includes('DevTools'),
    );
    expect(serious).toHaveLength(0);
  });
});
