/**
 * Test 5 — Onboarding wizard city step (Step 1).
 *
 * Covers:
 *   - Auth as tenant owner → land on /dashboard/onboarding/wizard
 *   - Step 1 is visible (contact info + city field)
 *   - City dropdown loads all 12 canonical cities
 *   - Pick "Brașov" → "Continuă →" enables → submit persists city_id
 *   - Wizard advances to Step 2 after submission
 *   - Free-text fallback visible when dropdown shows "(Alegeți...)"
 *
 * Prerequisites:
 *   - E2E_TENANT_OWNER_EMAIL must own a test tenant (ensureTestTenant).
 *   - The test tenant is in ACTIVE status with a NULL city_id.
 *   - The admin server env must include the test owner in tenant_members.
 *
 * baseURL = restaurant-admin (port 3001 or E2E_ADMIN_BASE_URL).
 */

import { test, expect } from '@playwright/test';
import {
  ensureUser,
  ensureTestTenant,
  resetTestTenantCity,
  getTenantCityId,
  getCityIdBySlug,
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_TENANT_OWNER_EMAIL,
  E2E_TENANT_OWNER_PASSWORD,
} from './fixtures/seed';
import { loginAsOwner } from './helpers/auth';

test.describe('Onboarding wizard city step', { tag: '@multi-city' }, () => {
  let tenantId: string;

  test.beforeAll(async () => {
    // Ensure both test users exist; the owner is the one attached to the tenant.
    await ensureUser(E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
    const ownerId = await ensureUser(E2E_TENANT_OWNER_EMAIL, E2E_TENANT_OWNER_PASSWORD);
    tenantId = await ensureTestTenant(ownerId);
  });

  test.beforeEach(async () => {
    await resetTestTenantCity(tenantId);
  });

  test('owner lands on the onboarding wizard', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/dashboard/onboarding/wizard');
    // Step indicator "Pasul 1 din 6"
    await expect(page.getByText(/pasul.*1.*din.*6/i)).toBeVisible({ timeout: 15_000 });
  });

  test('city dropdown loads 12 canonical cities', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/dashboard/onboarding/wizard');

    // Wait for the city select to be present (Step 1 shows it).
    const citySelect = page.locator('select').filter({ has: page.locator('option[value="brasov"]') }).first();
    await expect(citySelect).toBeAttached({ timeout: 15_000 });

    const slugs = [
      'bucuresti', 'brasov', 'cluj-napoca', 'timisoara', 'iasi',
      'constanta', 'sibiu', 'oradea', 'galati', 'ploiesti', 'craiova', 'arad',
    ];
    for (const slug of slugs) {
      await expect(page.locator(`option[value="${slug}"]`)).toBeAttached();
    }
  });

  test('free-text fallback visible when no city is selected', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/dashboard/onboarding/wizard');

    // The free-text fallback ("Alegeți orașul…" shows when slug="").
    // City select default is empty ("Alegeți orașul…"); the fallback input
    // should be present.
    const citySelect = page.locator('select').filter({ has: page.locator('option[value="brasov"]') }).first();
    await expect(citySelect).toBeAttached({ timeout: 15_000 });

    // If the draft has no prior city_id, the select defaults to "".
    const currentVal = await citySelect.inputValue();
    if (currentVal === '') {
      // Free-text fallback input should be visible.
      const fallback = page.locator('input[placeholder="ex: Bistrița"]');
      await expect(fallback).toBeVisible({ timeout: 5_000 });
    }
    // If draft has a city already selected from a previous run, skip assertion.
  });

  test('picking Brașov enables "Continuă →" and persists city_id', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/dashboard/onboarding/wizard');

    // Fill required phone field first (city alone isn't enough for stepReady).
    await page.getByLabel(/telefon|phone/i).fill('+40700000099');

    // Select Brașov from the city dropdown.
    const citySelect = page.locator('select').filter({ has: page.locator('option[value="brasov"]') }).first();
    await expect(citySelect).toBeAttached({ timeout: 15_000 });
    await citySelect.selectOption('brasov');

    // The "Continuă →" button should now be enabled (phone + city filled).
    const continueBtn = page.getByRole('button', { name: /continuă/i });
    await expect(continueBtn).not.toBeDisabled({ timeout: 5_000 });

    // Click continue — this persists city_id via saveRestaurantInfo server action.
    await continueBtn.click();

    // Wizard should advance to Step 2.
    await expect(page.getByText(/pasul.*2.*din.*6/i)).toBeVisible({ timeout: 15_000 });

    // Verify city_id was written to DB.
    const savedCityId = await getTenantCityId(tenantId);
    const brasovId = await getCityIdBySlug('brasov');
    expect(savedCityId).toBeTruthy();
    expect(savedCityId).toBe(brasovId);
  });

  test('wizard does not break when navigating back to Step 1 after city pick', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/dashboard/onboarding/wizard');

    const citySelect = page.locator('select').filter({ has: page.locator('option[value="brasov"]') }).first();
    await expect(citySelect).toBeAttached({ timeout: 15_000 });
    await citySelect.selectOption('brasov');

    // Fill phone to satisfy stepReady(1).
    await page.getByLabel(/telefon|phone/i).fill('+40700000099');

    // Advance to step 2.
    await page.getByRole('button', { name: /continuă/i }).click();
    await expect(page.getByText(/pasul.*2.*din.*6/i)).toBeVisible({ timeout: 10_000 });

    // Go back.
    await page.getByRole('button', { name: /înapoi/i }).click();
    await expect(page.getByText(/pasul.*1.*din.*6/i)).toBeVisible({ timeout: 10_000 });

    // The city select should retain "brasov".
    const restoredSelect = page.locator('select').filter({ has: page.locator('option[value="brasov"]') }).first();
    await expect(restoredSelect).toBeAttached();
    const val = await restoredSelect.inputValue();
    expect(val).toBe('brasov');
  });
});
