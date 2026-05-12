import { test, expect } from '@playwright/test';

test.describe('Tenant storefront (Foișorul A pilot)', () => {
  test('storefront homepage loads and shows menu', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status(), 'storefront HTTP status').toBeLessThan(400);
    // Restaurant name should be in the document title or visible somewhere.
    await expect(page).toHaveTitle(/foi[șs]orul|hir|restaurant/i, { timeout: 15_000 });
    // At least one menu category or item card should render — the storefront
    // is useless to a customer without visible menu content.
    const menuLocators = [
      page.getByRole('heading', { level: 2 }),
      page.locator('[data-testid="menu-item"]'),
      page.getByRole('button', { name: /adaug[ăa]|comand[ăa]|add/i }),
    ];
    let foundMenu = false;
    for (const loc of menuLocators) {
      if (await loc.first().isVisible().catch(() => false)) {
        foundMenu = true;
        break;
      }
    }
    expect(foundMenu, 'expected menu content (heading, item, or order CTA) to be visible').toBe(true);
  });

  test('storefront serves an Open Graph image meta tag', async ({ page }) => {
    await page.goto('/');
    const og = page.locator('meta[property="og:image"]');
    await expect(og).toHaveCount(1);
  });
});
