/**
 * POST /api/orders/[id]/self-pickup
 *
 * DISABLED (decision_pull_dispatch_eliminated_2026-08-04). Self-pickup let
 * any courier in a fleet claim an unassigned order from the open pool —
 * that's the "pull" mechanism the decision removed, because responsibility
 * becomes untraceable once more than one courier can independently grab the
 * same order. Allocation is now exclusively AUTOMAT (offer_courier_order /
 * fn_auto_dispatch_sweep) or MANUAL (dispatcher assigns) — a courier only
 * ever accepts a directed offer, via acceptOrderAction.
 *
 * Kept as a route (not deleted) so a PWA background-sync request queued
 * before this deploy fails with a clear error instead of a bare 404.
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
