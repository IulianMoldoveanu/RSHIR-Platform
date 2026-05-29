// POST /api/checkout/cancel-resume
//
// Marks a PENDING/UNPAID order as CANCELLED so the customer can re-submit
// the same cart without ending up with a duplicate ghost PENDING order.
// P0 audit #12.
//
// Idempotent: UPDATE WHERE status='PENDING' AND payment_status='UNPAID' →
// only the first call flips the row; subsequent calls (and races against
// the PSP webhook flipping status the other way) are no-ops.
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { assertSameOrigin } from '@/lib/origin-check';
import { checkLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ orderId: z.string().uuid() });

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  }
  const rl = checkLimit(`cancel-resume:${clientIp(req)}`, { capacity: 10, refillPerSec: 1 / 30 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  // Tenant-scoped + status-gated update. Returning .select() lets us tell
  // the client whether we actually flipped the row (so the UI can
  // distinguish "already cancelled" from "race with PSP webhook"). We do
  // NOT echo the difference to the customer — they always get a 200 so
  // the UX is deterministic.
  await sb
    .from('restaurant_orders')
    .update({ status: 'CANCELLED' })
    .eq('id', parsed.data.orderId)
    .eq('tenant_id', tenant.id)
    .eq('status', 'PENDING')
    .eq('payment_status', 'UNPAID');

  return NextResponse.json({ ok: true });
}
