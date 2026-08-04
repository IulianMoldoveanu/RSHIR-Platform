/**
 * POST /api/display/orders/[id]/self-pickup
 *
 * DISABLED (decision_pull_dispatch_eliminated_2026-08-04). This powered the
 * tablet-kiosk self-pickup flow (deliveryhouse Dodo pattern) — a courier
 * tapping an open order on the in-location tablet to claim it. Same "pull"
 * problem as the phone self-pickup route: removed for the same reason.
 * Allocation is now AUTOMAT (offer_courier_order / fn_auto_dispatch_sweep)
 * or MANUAL (dispatcher assigns) only.
 *
 * Kept as a route (not deleted) so an in-flight tablet request fails with a
 * clear error instead of a bare 404.
 */

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'self_pickup_disabled',
      message: 'Self-pickup a fost eliminat. Comenzile se asignează automat sau de dispecer.',
    },
    { status: 410 },
  );
}
