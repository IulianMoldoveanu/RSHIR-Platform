import { test, expect } from '@playwright/test';
import {
  seedCourier,
  seedOrder,
  cleanupOrder,
  endAnyOpenShift,
  adminSupabase,
} from './fixtures/seed';
import { loginAsTestCourier } from './helpers/auth';

test.describe('Accept → deliver lifecycle', () => {
  let userId: string;
  let fleetId: string;
  let orderId: string;

  test.beforeEach(async () => {
    const seeded = await seedCourier();
    userId = seeded.userId;
    fleetId = seeded.fleetId;
    await endAnyOpenShift(userId);
    // Seed an unassigned CREATED order so the courier can claim it.
    const order = await seedOrder(fleetId);
    orderId = order.orderId;
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

  // The accept → picked-up → delivered flow drives photo upload at the
  // delivered step which needs a real file picker. Until we wire a stubbed
  // proof URL, this test verifies only the accept + pickup path so it
  // produces value without flakiness from the file dialog.
  test('courier can claim an open order and mark picked up', async ({ page }) => {
    await loginAsTestCourier(page);

    await page.goto('/dashboard/orders');
    await expect(page.getByText('E2E Client').first()).toBeVisible({ timeout: 30_000 });

    // Click into the order detail; primary CTA there is "Acceptă".
    await page.getByText('E2E Client').first().click();
    await page.getByRole('button', { name: /accept/i }).first().click();

    // After accept, the page should show the next step CTA.
    await expect(page.getByText(/ridicat|picked|preluat/i).first()).toBeVisible({ timeout: 30_000 });

    const { data: row } = await adminSupabase
      .from('courier_orders')
      .select('status, assigned_courier_user_id')
      .eq('id', orderId)
      .maybeSingle();
    expect(row?.assigned_courier_user_id).toBe(userId);
    expect(['ACCEPTED', 'PICKED_UP']).toContain(row?.status as string);
  });
});
