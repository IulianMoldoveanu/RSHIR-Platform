// POST /api/dispatch/reassign
//
// Reassigns a courier_order to a different courier.
// MVP stub — full implementation pending dispatch engine integration.
// Gated by platform-admin allow-list.

import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.order_id || !body.courier_user_id) {
    return NextResponse.json({ error: 'order_id and courier_user_id required' }, { status: 400 });
  }

  // TODO: implement reassign endpoint
  // 1. Verify order is in {OFFERED, ACCEPTED, PICKED_UP, IN_TRANSIT}
  // 2. Update courier_orders.assigned_courier_user_id
  // 3. Push notification to new courier via push/dispatch.ts
  // 4. Audit log the reassignment

  return NextResponse.json({ ok: true, message: 'Reassign stub — not yet implemented' }, { status: 501 });
}
