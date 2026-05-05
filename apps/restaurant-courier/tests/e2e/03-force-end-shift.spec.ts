import { test, expect } from '@playwright/test';
import {
  seedCourier,
  seedOrder,
  cleanupOrder,
  endAnyOpenShift,
  adminSupabase,
} from './fixtures/seed';
import { loginAsTestCourier } from './helpers/auth';

// Preset reasons as defined in src/components/force-end-shift.tsx.
// If the component changes its PRESET_REASONS array this test breaks loudly,
// which is intentional — it's the canary for selector drift.
const PRESET_VEHICLE_DEFECT = 'Vehicul defect / incident pe traseu';

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
    // Put the order in ACCEPTED so the courier has an active order.
    // ForceEndShift is only rendered when activeOrderCount > 0, which the
    // server-side shift page derives from orders in ACCEPTED / PICKED_UP /
    // IN_TRANSIT states assigned to this courier.
    await adminSupabase
      .from('courier_orders')
      .update({ status: 'ACCEPTED', assigned_courier_user_id: userId })
      .eq('id', orderId);
    // Open a shift so the shift page renders the ForceEndShift component.
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

  test('opens modal, picks preset reason, confirms, ends shift and cancels order', async ({ page }) => {
    await loginAsTestCourier(page);
    await page.goto('/dashboard/shift');

    // The "Închide tura forțat" button is rendered by ForceEndShift only when
    // the courier has at least one active order. The shift page was seeded with
    // exactly one ACCEPTED order, so the button must be present.
    const forceBtn = page.getByRole('button', { name: /Închide tura forțat/i });
    await expect(forceBtn).toBeVisible({ timeout: 15_000 });
    await forceBtn.click();

    // Modal opens — verify it is present via the dialog role.
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

    // Pick the preset reason using the <label> text (the radio input is sr-only;
    // clicking the label is what a real user does on mobile).
    await page.getByText(PRESET_VEHICLE_DEFECT).click();

    // Confirm button text is "Confirmă".
    const confirmBtn = page.getByRole('button', { name: /Confirmă/i });
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // After force-end the server action calls revalidatePath('/dashboard') and
    // '/dashboard/shift'. The modal unmounts and the page re-renders to
    // offline state (no ONLINE shift exists anymore). We check for the Offline
    // badge text rendered by the shift page's status span.
    await expect(page.getByText(/Offline/i).first()).toBeVisible({ timeout: 15_000 });

    // Verify the order was cancelled in the DB with the correct prefix.
    const { data: orderRow } = await adminSupabase
      .from('courier_orders')
      .select('status, cancellation_reason')
      .eq('id', orderId)
      .maybeSingle();
    expect(orderRow?.status).toBe('CANCELLED');
    // The server action stores: `courier_force_end_shift: <reason>`
    expect(orderRow?.cancellation_reason ?? '').toContain('courier_force_end_shift');
    expect(orderRow?.cancellation_reason ?? '').toContain(PRESET_VEHICLE_DEFECT);

    // Shift must be OFFLINE (or absent) in the DB.
    const { data: shifts } = await adminSupabase
      .from('courier_shifts')
      .select('id, status')
      .eq('courier_user_id', userId)
      .eq('status', 'ONLINE');
    expect(shifts ?? []).toHaveLength(0);
  });
});
