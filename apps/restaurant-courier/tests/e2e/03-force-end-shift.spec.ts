import { test, expect } from '@playwright/test';
import {
  seedCourier,
  seedOrder,
  cleanupOrder,
  endAnyOpenShift,
  adminSupabase,
} from './fixtures/seed';
import { loginAsTestCourier } from './helpers/auth';

test.describe('Force end shift', () => {
  let userId: string;
  let fleetId: string;
  let orderId: string;

  test.beforeEach(async () => {
    const seeded = await seedCourier();
    userId = seeded.userId;
    fleetId = seeded.fleetId;
    await endAnyOpenShift(userId);
    const order = await seedOrder(fleetId);
    orderId = order.orderId;
    await adminSupabase
      .from('courier_orders')
      .update({ status: 'ACCEPTED', assigned_courier_user_id: userId })
      .eq('id', orderId);
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

  test.fixme('opens modal, picks reason, cancels active order + ends shift', async ({ page }) => {
    await loginAsTestCourier(page);
    await page.goto('/dashboard/shift');
    await page.getByRole('button', { name: /forțează|force/i }).click();
    await page.getByRole('button', { name: /problemă tehnică|technical/i }).click();
    await page.getByRole('button', { name: /confirm/i }).click();

    await expect(page.getByText(/offline/i).first()).toBeVisible({ timeout: 15_000 });

    const { data: row } = await adminSupabase
      .from('courier_orders')
      .select('status, cancellation_reason')
      .eq('id', orderId)
      .maybeSingle();
    expect(row?.status).toBe('CANCELLED');
    expect(row?.cancellation_reason ?? '').toContain('courier_force_end_shift');
  });
});
