import { test, expect } from '@playwright/test';
import {
  seedCourier,
  seedOrder,
  cleanupOrder,
  cleanupAssignedOrdersForCourier,
  endAnyOpenShift,
  adminSupabase,
} from './fixtures/seed';
import { loginAsTestCourier, holdSwipeButton } from './helpers/auth';

test.describe('Pickup lifecycle', () => {
  let userId: string;
  let fleetId: string;
  let orderId: string;
  let customerName: string;

  test.beforeEach(async () => {
    const seeded = await seedCourier();
    userId = seeded.userId;
    fleetId = seeded.fleetId;
    await endAnyOpenShift(userId);
    // Critical hygiene: wipe any leftover non-terminal orders still
    // assigned to the synthetic test courier. Without this, a prior
    // crashed run leaves ACCEPTED/PICKED_UP rows behind and the next
    // run's getByText('E2E Client').first() picks the STALE row from
    // the list — the swipe then fires markPickedUpAction on the wrong
    // orderId and this test's DB assertion fails silently.
    await cleanupAssignedOrdersForCourier(userId);
    // Pre-assign the order to the test courier in ACCEPTED state. The seeded
    // courier joins `e2e-test-fleet`, which puts them in Mode C — that mode
    // hides the "Comenzi disponibile" section entirely (riders are dispatched
    // by their fleet manager, not via self-claim). To keep the test
    // environment-agnostic, we skip the accept step and exercise only the
    // ACCEPTED → PICKED_UP transition, which is identical across all modes.
    //
    // Customer name carries a per-run token so the list-page locator can
    // pin this exact order even when concurrent runs share the courier.
    const order = await seedOrder(fleetId);
    orderId = order.orderId;
    customerName = order.customerName;
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

  test('courier can mark a pre-assigned order as picked up', async ({ page }) => {
    await loginAsTestCourier(page);

    // The order is in ACCEPTED state and assigned to this courier, so it
    // appears in the "Comenzile mele" section on the orders list. We match
    // by the unique customerName token (NOT a generic prefix) so a stale
    // row from a prior run can never intercept the click.
    await page.goto('/dashboard/orders');
    await expect(page.getByText(customerName)).toBeVisible({ timeout: 30_000 });
    await page.getByText(customerName).click();

    // Confirm we landed on this specific order's detail page before any
    // swipe gesture fires. Without this guard, a list-page race could
    // route the swipe at a wrong target.
    await expect(page).toHaveURL(new RegExp(`/dashboard/orders/${orderId}`));

    // Order detail page: with status=ACCEPTED + isMine=true, OrderActions
    // renders the pickup swipe button. Swipe it to fire markPickedUpAction.
    await holdSwipeButton(page, /Glisează pentru a confirma ridicare/i);

    // Verify the DB transition directly — the previous UI-only assertion
    // could pass against a stale chip from the list. Poll briefly to
    // tolerate the revalidatePath round-trip.
    await expect
      .poll(
        async () => {
          const { data: row } = await adminSupabase
            .from('courier_orders')
            .select('status, assigned_courier_user_id')
            .eq('id', orderId)
            .maybeSingle();
          return row?.status;
        },
        { timeout: 15_000, intervals: [500, 1000, 2000] },
      )
      .toBe('PICKED_UP');

    const { data: row } = await adminSupabase
      .from('courier_orders')
      .select('status, assigned_courier_user_id')
      .eq('id', orderId)
      .maybeSingle();
    expect(row?.assigned_courier_user_id).toBe(userId);
    expect(row?.status).toBe('PICKED_UP');
  });
});
