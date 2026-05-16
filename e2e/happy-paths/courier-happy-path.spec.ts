/**
 * Courier full happy-path E2E (Wave 4-C).
 *
 * Covers the canonical RSHIR courier lifecycle:
 *   1. Register / login courier
 *   2. Start shift (swipe gesture → ONLINE row in courier_shifts)
 *   3. Accept an offered order
 *   4. Mark picked up (ACCEPTED → PICKED_UP)
 *   5. Mark delivered (PICKED_UP → DELIVERED)
 *   6. Earnings line appears in /courier/dashboard/earnings
 *
 * ── Why most steps are `test.fixme()` ─────────────────────────────────────
 * The end-to-end lifecycle requires:
 *   - a synthetic courier user in auth.users (service-role admin call)
 *   - a seeded courier_orders row with a known fleet_id
 *   - mid-test status mutations + post-test cleanup
 *
 * Those flows already exist in `apps/restaurant-courier/tests/e2e/`
 * (`01-login-shift`, `02-accept-deliver`, etc.) and use
 * `tests/e2e/fixtures/seed.ts` with service-role keys. The Wave 4-C
 * scope is restricted to `e2e/` only — we cannot import the
 * in-app fixtures from here.
 *
 * Until a service-role seed helper is added under `e2e/_setup/` (a
 * follow-up wave), the seeded steps stay `test.fixme()`. The login page
 * smoke + earnings page surface checks DO run against any deployed
 * courier app and prove the routes are alive.
 */

import { test, expect } from '@playwright/test';

const COURIER_TEST_EMAIL = process.env.E2E_COURIER_EMAIL ?? 'courier-e2e@hir.test';
const COURIER_TEST_PASSWORD = process.env.E2E_COURIER_PASSWORD ?? 'Courier-E2E-Pass-2026';

test.describe('Courier happy path', { tag: '@happy-path' }, () => {
  test('login page renders email + password form', async ({ page }) => {
    const response = await page.goto('/login');
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/parol|password/i)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /intr[ăa]|conect|continu[ăa]/i }).first(),
    ).toBeVisible();
  });

  test('unauthenticated /courier/dashboard/earnings redirects to login', async ({ page }) => {
    const response = await page.goto('/courier/dashboard/earnings');
    expect(response?.status()).toBeLessThan(400);
    const url = page.url();
    if (!url.includes('/login')) {
      await expect(page.getByLabel(/email/i)).toBeVisible();
    } else {
      expect(url).toMatch(/\/login/);
    }
  });

  test('register + login + start shift writes ONLINE row', async ({ page }) => {
    test.fixme(
      true,
      'Requires service-role seed of a synthetic auth.user + courier profile + shift cleanup. ' +
        'Existing implementation lives at apps/restaurant-courier/tests/e2e/01-login-shift.spec.ts ' +
        'using fixtures/seed.ts. Promote to a shared e2e/_setup/ helper in a follow-up wave.',
    );

    // Reference flow once seed helpers exist under e2e/_setup/:
    //   import { seedCourier, endAnyOpenShift } from '../_setup/courier-seed';
    //   const { userId } = await seedCourier();
    //   await endAnyOpenShift(userId);
    //   await page.goto('/login');
    //   await page.getByLabel(/email/i).fill(COURIER_TEST_EMAIL);
    //   await page.getByLabel(/parol|password/i).fill(COURIER_TEST_PASSWORD);
    //   await page.getByRole('button', { name: /intr[ăa]|conect/i }).click();
    //   await holdSwipeButton(page, /glisează|porni tura|pornește tura|start/i);
    //   await expect(page.getByText(/online/i).first()).toBeVisible({ timeout: 30_000 });
    expect(COURIER_TEST_EMAIL).toBeTruthy();
    expect(COURIER_TEST_PASSWORD).toBeTruthy();
  });

  test('accept offered order → ACCEPTED status', async ({ page: _page }) => {
    test.fixme(
      true,
      'Requires service-role insert of courier_orders row with offered_to_courier_user_id ' +
        'set to the seeded courier. Realtime claim race covered separately by ' +
        'apps/restaurant-courier/tests/e2e/03-force-end-shift.spec.ts.',
    );
  });

  test('mark picked up (ACCEPTED → PICKED_UP)', async ({ page: _page }) => {
    test.fixme(
      true,
      'Existing coverage in apps/restaurant-courier/tests/e2e/02-accept-deliver.spec.ts. ' +
        'Re-implementing under e2e/ requires shared seed helpers — pending Wave 4-D.',
    );
  });

  test('mark delivered (PICKED_UP → DELIVERED)', async ({ page: _page }) => {
    test.fixme(
      true,
      'Same dependency: shared service-role seed. Once available, swipe the deliver button ' +
        'and assert courier_orders.status = DELIVERED + delivered_at IS NOT NULL.',
    );
  });

  test('earnings line appears in /courier/dashboard/earnings after delivery', async ({ page: _page }) => {
    test.fixme(
      true,
      'Earnings rollup is populated by the trigger that fires on DELIVERED transition. ' +
        'Cannot be verified without driving steps 1-5 first.',
    );
  });
});
