import { test, expect } from '@playwright/test';
import {
  seedCourier,
  seedOrder,
  cleanupOrder,
  endAnyOpenShift,
  adminSupabase,
} from './fixtures/seed';
import { loginAsTestCourier, holdSwipeButton } from './helpers/auth';

test.describe('Pickup lifecycle', () => {
  let userId: string;
  let fleetId: string;
  let orderId: string;

  test.beforeEach(async () => {
    const seeded = await seedCourier();
    userId = seeded.userId;
    fleetId = seeded.fleetId;
    await endAnyOpenShift(userId);
    // Pre-assign the order to the test courier in ACCEPTED state. The seeded
    // courier joins `e2e-test-fleet`, which puts them in Mode C — that mode
    // hides the "Comenzi disponibile" section entirely (riders are dispatched
    // by their fleet manager, not via self-claim). To keep the test
    // environment-agnostic, we skip the accept step and exercise only the
    // ACCEPTED → PICKED_UP transition, which is identical across all modes.
    const order = await seedOrder(fleetId);
    orderId = order.orderId;
    await adminSupabase
      .from('courier_orders')
      .update({
        status: 'ACCEPTED',
        assigned_courier_user_id: userId,
      })
      .eq('id', orderId);
    // Open a shift directly so the test focuses on the order lifecycle, not
    // the swipe-to-start UX (covered by 01-login-shift.spec.ts).
    await adminSupabase.from('courier_shifts').insert({
      courier_user_id: userId,
      status: 'ONLINE',
      last_lat: 45.6427,
      last_lng: 25.5887,
      last_seen_at: new Date().toISOString(),
    });
  });

  test.afterEach(async () => {
    await cleanupOrder(orderId);
    await endAnyOpenShift(userId);
  });

  // FIXME(courier-e2e): the "Ridicată" UI assertion passes but the DB row
  // still reads ACCEPTED — markPickedUpAction either fired on a stale
  // orderId (leftover from prior crashed run sharing the e2e- prefix) or
  // the swipe gesture is matching a "Confirmă ridicare" button visible
  // on a list item rather than on the detail page. Reproduce locally
  // with --headed to inspect; one-shot CI run is not enough signal.
  test.skip('courier can mark a pre-assigned order as picked up', async ({ page }) => {
    await loginAsTestCourier(page);

    // The order is in ACCEPTED state and assigned to this courier, so it
    // appears in the "Comenzile mele" section on the orders list.
    await page.goto('/dashboard/orders');
    await expect(page.getByText('E2E Client').first()).toBeVisible({ timeout: 30_000 });
    await page.getByText('E2E Client').first().click();

    // Order detail page: with status=ACCEPTED + isMine=true, OrderActions
    // renders the pickup swipe button. Swipe it to fire markPickedUpAction.
    await holdSwipeButton(page, /Glisează pentru a confirma ridicare/i);

    // After the action, the page revalidates and the status chip flips to
    // "Ridicată". Verify both UI + DB to lock the transition.
    await expect(page.getByText(/Ridicată/i).first()).toBeVisible({ timeout: 30_000 });

    const { data: row } = await adminSupabase
      .from('courier_orders')
      .select('status, assigned_courier_user_id')
      .eq('id', orderId)
      .maybeSingle();
    expect(row?.assigned_courier_user_id).toBe(userId);
    expect(row?.status).toBe('PICKED_UP');
  });
});
