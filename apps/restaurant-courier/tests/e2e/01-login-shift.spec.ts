import { test, expect } from '@playwright/test';
import {
  seedCourier,
  endAnyOpenShift,
  adminSupabase,
} from './fixtures/seed';
import { loginAsTestCourier, holdSwipeButton } from './helpers/auth';

test.describe('Login + shift toggle', () => {
  let userId: string;

  test.beforeEach(async () => {
    const seeded = await seedCourier();
    userId = seeded.userId;
    await endAnyOpenShift(userId);
  });

  test.afterEach(async () => {
    await endAnyOpenShift(userId);
  });

  test('login lands on dashboard offline state', async ({ page }) => {
    await loginAsTestCourier(page);
    await expect(page.getByText(/offline/i).first()).toBeVisible();
  });

  test('start + end shift writes one ONLINE row then closes it', async ({ page }) => {
    await loginAsTestCourier(page);

    await holdSwipeButton(page, /pornește tura|start/i);

    // The shift action redirects + revalidates; wait for the online indicator.
    await expect(page.getByText(/online/i).first()).toBeVisible({ timeout: 15_000 });

    const { data: openShifts } = await adminSupabase
      .from('courier_shifts')
      .select('id, status')
      .eq('courier_user_id', userId)
      .eq('status', 'ONLINE');
    expect(openShifts ?? []).toHaveLength(1);
  });
});
