/**
 * Lane INVENTORY-V1 PR 2 — recipe link smoke.
 *
 * Covers:
 *   - feature_flags.inventory_enabled = false → upsell page rendered
 *   - feature_flags.inventory_enabled = true  → /dashboard/inventory list visible
 *   - Create an inventory item via the on-page form
 *   - Open the item detail page → empty recipes state visible
 *   - Link the item to the seeded test menu item with qty per serving
 *   - Detail page shows the new recipe row
 *   - DB row exists in menu_item_recipes (composite FK satisfied)
 *
 * Prerequisites:
 *   - E2E_TENANT_OWNER_EMAIL owns the test tenant (ensureTestTenant).
 *   - Migrations 20260506_013 + 20260507_006/007/008 applied (#307 merged).
 *
 * baseURL = restaurant-admin.
 */

import { test, expect } from '@playwright/test';
import {
  ensureUser,
  ensureTestTenant,
  setInventoryEnabled,
  ensureTestMenuItem,
  clearTenantInventory,
  readRecipeRowsForTenant,
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_TENANT_OWNER_EMAIL,
  E2E_TENANT_OWNER_PASSWORD,
} from './fixtures/seed';
import { loginAsOwner } from './helpers/auth';

test.describe('Inventory v1 — recipe link', { tag: '@inventory' }, () => {
  let tenantId: string;
  let menuItemId: string;

  test.beforeAll(async () => {
    await ensureUser(E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
    const ownerId = await ensureUser(E2E_TENANT_OWNER_EMAIL, E2E_TENANT_OWNER_PASSWORD);
    tenantId = await ensureTestTenant(ownerId);
    menuItemId = await ensureTestMenuItem(tenantId);
  });

  test.beforeEach(async () => {
    await clearTenantInventory(tenantId);
  });

  test.afterAll(async () => {
    await clearTenantInventory(tenantId);
    await setInventoryEnabled(tenantId, false);
  });

  test('upsell page renders when inventory_enabled is false', async ({ page }) => {
    await setInventoryEnabled(tenantId, false);
    await loginAsOwner(page);
    await page.goto('/dashboard/inventory');
    await expect(
      page.getByRole('heading', { name: /stocuri inteligente/i }),
    ).toBeVisible();
    // Upsell CTA copy
    await expect(page.getByRole('link', { name: /solicitați activarea/i })).toBeVisible();
  });

  test('OWNER can create inventory item, link it to a menu item, and the recipe persists', async ({ page }) => {
    await setInventoryEnabled(tenantId, true);
    await loginAsOwner(page);
    await page.goto('/dashboard/inventory');

    // Page header
    await expect(page.getByRole('heading', { name: 'Stocuri', exact: true })).toBeVisible();

    // Create form is visible — fill it.
    await page.getByLabel(/nume ingredient/i).fill('Brânză cașcaval (E2E)');
    await page.locator('select[name="unit"]').selectOption('kg');
    await page.locator('input[name="current_stock"]').fill('10');
    await page.locator('input[name="reorder_threshold"]').fill('2');
    await page.getByRole('button', { name: /adaugă ingredient/i }).click();

    // Row appears in the list table.
    const row = page.locator('tr', { hasText: 'Brânză cașcaval (E2E)' });
    await expect(row).toBeVisible();

    // Click into details.
    await row.getByRole('link', { name: /detalii/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/inventory\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole('heading', { name: 'Brânză cașcaval (E2E)' }),
    ).toBeVisible();

    // Empty-state copy.
    await expect(page.getByTestId('recipes-empty')).toBeVisible();

    // Link the recipe.
    await page.locator('select[name="menu_item_id"]').selectOption(menuItemId);
    await page.locator('input[name="qty_per_serving"]').fill('0.05');
    await page.getByRole('button', { name: /adaugă rețetă/i }).click();

    // Recipe row visible after refresh. Match by data-menu-item-id directly
    // on the <li> (filter({has}) needs a descendant; we want the row itself).
    const recipeRow = page.locator(
      `[data-testid="recipe-row"][data-menu-item-id="${menuItemId}"]`,
    );
    await expect(recipeRow).toBeVisible();
    await expect(recipeRow).toContainText(/0,05 kg per porție/);

    // DB-side assertion: composite FK accepted, exactly one row exists.
    const rows = await readRecipeRowsForTenant(tenantId);
    expect(rows).toHaveLength(1);
    expect(rows[0].menu_item_id).toBe(menuItemId);
    expect(Number(rows[0].qty_per_serving)).toBeCloseTo(0.05, 4);
  });
});
