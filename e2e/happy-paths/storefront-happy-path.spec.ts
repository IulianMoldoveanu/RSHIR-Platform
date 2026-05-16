/**
 * Storefront full happy-path E2E (Wave 4-C).
 *
 * Covers the canonical RSHIR customer order journey:
 *   1. Visit city landing /orase/brasov → click first tenant card
 *   2. Add 1 item to cart
 *   3. Open cart → checkout
 *   4. Fill customer info (Ion Popescu / +40712345678 / Strada Lungă 5, Brașov)
 *   5. Select COD payment
 *   6. Submit → expect redirect to /checkout/success?order_id=...
 *   7. Visit /track?token=... → expect status "Placed" or "Confirmed"
 *   8. Leave a 5-star review on /review/[token]
 *
 * ── Why most steps are `test.fixme()` ─────────────────────────────────────
 * The full lifecycle requires:
 *   - a seeded demo tenant with menu_items + active fleet
 *   - mutating restaurant_orders (insert + status transitions)
 *   - capturing the order token from the checkout response for the
 *     /track + /review deep links
 *
 * These need either:
 *   (a) a known-good `demo` tenant slug in the target environment, OR
 *   (b) a service-role seed helper under `e2e/_setup/` that creates a
 *       per-test-run tenant + cleans up after.
 *
 * Neither is wired up under `e2e/` yet (multi-city fixtures focus on
 * cities/FMs, not full menu/order chains). The non-fixme steps below
 * verify the entry-point routes are alive against any deployed
 * environment — full lifecycle promotes to runnable in a follow-up wave.
 */

import { test, expect } from '@playwright/test';

const CUSTOMER = {
  name: 'Ion Popescu',
  phone: '+40712345678',
  street: 'Strada Lungă 5',
  city: 'Brașov',
} as const;

test.describe('Storefront happy path', { tag: '@happy-path' }, () => {
  test('city landing /orase/brasov renders a clickable tenant grid', async ({ page }) => {
    const response = await page.goto('/orase/brasov');
    expect(response?.status()).toBe(200);

    const tenantCards = page.locator('a[href^="/m/"]');
    const emptyState = page.getByText(/suntem în pregătire pentru/i);
    const count = await tenantCards.count();

    if (count === 0) {
      // Empty seed state in target env — verify graceful degradation only.
      // eslint-disable-next-line no-console
      console.warn('[storefront-happy-path] /orase/brasov has 0 tenants; checking empty-state copy');
      await expect(emptyState).toBeVisible();
      return;
    }

    // Click-through to the first tenant; the landing page should respond
    // with a 200 and surface a menu (h1 or item list).
    const firstCard = tenantCards.first();
    await expect(firstCard).toBeVisible();
    const href = await firstCard.getAttribute('href');
    expect(href, 'tenant card href').toMatch(/^\/m\//);

    await firstCard.click();
    // Wait for navigation to the tenant page.
    await expect(page).toHaveURL(/\/m\//, { timeout: 15_000 });
    // Tenant pages always render an h1 (restaurant name or hero).
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });
  });

  test('add item to cart → checkout form renders', async ({ page: _page }) => {
    test.fixme(
      true,
      'Requires a known demo tenant slug with at least one menu_item in the target env. ' +
        'No canonical "demo" tenant exists in the seed under `e2e/` — multi-city seed only ' +
        'creates city rows. Promote to runnable once `e2e/_setup/demo-tenant-seed.ts` lands.',
    );

    // Reference flow once seed exists:
    //   await page.goto(`/m/${DEMO_TENANT_SLUG}`);
    //   await page.getByRole('button', { name: /adaug[ăa].*co[șs]/i }).first().click();
    //   await page.getByRole('link', { name: /co[șs]|cart/i }).click();
    //   await expect(page).toHaveURL(/\/checkout/);
  });

  test('fill customer info + select COD + submit → /checkout/success', async ({ page: _page }) => {
    test.fixme(
      true,
      'Depends on the preceding add-to-cart step plus a tenant configured with delivery_mode ' +
        'including COD. Once seed is in place, fill the form with: ' +
        `${CUSTOMER.name} / ${CUSTOMER.phone} / ${CUSTOMER.street}, ${CUSTOMER.city}, ` +
        'submit, and assert the URL matches /checkout/success\\?order_id=...',
    );
  });

  test('/track?token=... shows Placed or Confirmed', async ({ page: _page }) => {
    test.fixme(
      true,
      'Requires the order token captured from the /checkout/success redirect. ' +
        'Track page (apps/restaurant-web/src/app/track) reads the token + renders the ' +
        'timeline; the freshly-placed order must show status="Placed" before any KDS ' +
        'action OR "Confirmed" if auto-confirm is enabled for the demo tenant.',
    );
  });

  test('leave a 5-star review on /review/[token]', async ({ page: _page }) => {
    test.fixme(
      true,
      'Review flow requires the order to be DELIVERED first (review token is gated on ' +
        'delivery in apps/restaurant-web/src/app/review). Cannot run without driving the ' +
        'full lifecycle through the courier app — pending shared seed helpers.',
    );
  });
});
