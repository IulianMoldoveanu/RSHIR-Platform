// Customer Web Push opt-in for the public /track/[token] page.
// Anonymous, token-gated. The customer's browser calls this after
// pushManager.subscribe() to persist the subscription so we can send
// notifications when order status changes.
//
// Auth: knowing the public_track_token. Rate-limited to 10/min per IP.
// The tenant_id is derived from the order — never trusted from the body.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { checkLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ token: z.string().uuid() });

const bodySchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

// Statuses where further notifications are meaningful. Once DELIVERED or
// CANCELLED, no more pushes will come so we reject new subscriptions.
const SUBSCRIBABLE_STATUSES = new Set([
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'DISPATCHED',
  'IN_DELIVERY',
]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const rl = checkLimit(`track-push-sub:${clientIp(req)}`, { capacity: 10, refillPerSec: 1 / 6 });
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

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const bodyParsed = bodySchema.safeParse(rawBody);
  if (!bodyParsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: order, error: lookupErr } = await admin
    .from('restaurant_orders')
    .select('id, tenant_id, status')
    .eq('public_track_token', parsed.data.token)
    .single();

  if (lookupErr || !order) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (!SUBSCRIBABLE_STATUSES.has(order.status)) {
    return NextResponse.json(
      { error: 'order_not_active', status: order.status },
      { status: 409 },
    );
  }

  const { endpoint, keys } = bodyParsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upsertErr } = await (admin as any)
    .from('customer_push_subscriptions')
    .upsert(
      {
        tenant_id: order.tenant_id,
        order_id: order.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      { onConflict: 'order_id,endpoint' },
    );

  if (upsertErr) {
    console.error('[track/push/subscribe] upsert failed', upsertErr.message);
    return NextResponse.json({ error: 'subscribe_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
