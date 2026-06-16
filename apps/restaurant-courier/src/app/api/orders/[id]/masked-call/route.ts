import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import { getOrCreateMaskedSession, isCallMaskingEnabled } from '@/lib/call-masking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ id: z.string().uuid() });

// Active statuses during which a courier may place a masked call to the customer.
const CALLABLE = new Set(['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']);

/**
 * POST /api/orders/:id/masked-call
 * Returns the proxy number the authenticated courier dials to reach the
 * customer (Twilio Proxy). Behind CALL_MASKING_ENABLED — returns
 * { enabled:false } when off so the client can fall back to the existing UX.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = paramsSchema.safeParse(await ctx.params);
  if (!params.success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  // Cheap short-circuit when masking isn't provisioned — no auth/DB work needed.
  if (!isCallMaskingEnabled()) {
    return NextResponse.json({ enabled: false });
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClientUntyped();
  const { data: order } = await admin
    .from('courier_orders')
    .select('id, status, assigned_courier_user_id, customer_phone')
    .eq('id', params.data.id)
    .maybeSingle();

  if (!order || order.assigned_courier_user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (!CALLABLE.has(order.status)) {
    return NextResponse.json({ error: 'not_active' }, { status: 422 });
  }
  if (!order.customer_phone) {
    return NextResponse.json({ error: 'no_customer_phone' }, { status: 422 });
  }

  const { data: profile } = await admin
    .from('courier_profiles')
    .select('phone')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile?.phone) {
    return NextResponse.json({ error: 'no_courier_phone' }, { status: 422 });
  }

  const result = await getOrCreateMaskedSession({
    courierOrderId: order.id,
    courierPhone: profile.phone,
    clientPhone: order.customer_phone,
  });

  if (!result.ok) {
    if (result.reason === 'disabled') return NextResponse.json({ enabled: false });
    console.error('[masked-call] failed', result.reason);
    return NextResponse.json({ error: 'masking_failed' }, { status: 502 });
  }

  return NextResponse.json({ enabled: true, number: result.courierProxyNumber });
}
