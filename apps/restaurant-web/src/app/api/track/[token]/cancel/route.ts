// RSHIR-54: customer self-cancel via the public track token.
// Anonymous, token-gated. Only allowed while status = 'PENDING' — once
// the restaurant accepts (CONFIRMED) the customer must call. We also
// refuse if payment_status = 'PAID' to keep refund handling out of MVP.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { dispatchOrderEvent } from '@/lib/integration-bus';
import { checkLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ token: z.string().uuid() });

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  // Token-only auth — a leaked or guessed token + scripted POST could
  // enumerate cancellable orders. 10 cancels per IP per minute is plenty
  // for a real customer (one order, one click) and shuts the door on
  // brute-forcing the UUID space.
  const rl = checkLimit(`track-cancel:${clientIp(req)}`, { capacity: 10, refillPerSec: 1 / 6 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const parsed = paramsSchema.safeParse((await ctx.params));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: order, error: lookupErr } = await admin
    .from('restaurant_orders')
    .select('id, tenant_id, status, payment_status')
    .eq('public_track_token', parsed.data.token)
    .single();
  if (lookupErr || !order) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (order.status !== 'PENDING' || order.payment_status === 'PAID') {
    return NextResponse.json({ error: 'invalid_state', status: order.status }, { status: 409 });
  }

  const { error: updErr } = await admin
    .from('restaurant_orders')
    .update({ status: 'CANCELLED', notes: '[SELF-CANCEL]' })
    .eq('id', order.id)
    .eq('status', 'PENDING');
  if (updErr) {
    // SECURITY: don't echo DB error.message to anonymous callers (token-only auth).
    console.error('[track/cancel] order update failed', updErr.message);
    return NextResponse.json({ error: 'cancel_failed' }, { status: 500 });
  }

  // Best-effort audit row (anonymous actor).
  const auditSb = admin as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => Promise<unknown>;
    };
  };
  auditSb
    .from('audit_log')
    .insert({
      tenant_id: order.tenant_id,
      actor_user_id: null,
      action: 'order.cancelled',
      entity_type: 'order',
      entity_id: order.id,
      metadata: { source: 'self-cancel', from: 'PENDING' },
    })
    .catch((e: unknown) => console.error('[track-cancel] audit insert failed', e));

  // Notify any active POS adapter.
  await dispatchOrderEvent(order.tenant_id, 'cancelled', {
    orderId: order.id,
    source: 'INTERNAL_STOREFRONT',
    status: 'CANCELLED',
    items: [],
    totals: { subtotalRon: 0, deliveryFeeRon: 0, totalRon: 0 },
    customer: { firstName: '', phone: '' },
    dropoff: null,
    notes: '[SELF-CANCEL]',
  });

  return NextResponse.json({ ok: true, status: 'CANCELLED' });
}
