// Inbound webhook from the RSHIR courier app. The courier service POSTs
// status updates here as drivers accept / pick up / deliver each order;
// HIR maps them onto its restaurant_orders.status state machine and
// pushes the change down the integration bus.
//
// Auth: HMAC-SHA256 of the raw body, header `x-courier-signature` =
// `sha256=<hex>`. The shared secret lives in the COURIER_WEBHOOK_SECRET
// env var. This is the same shape Stripe uses, so the courier app can
// crib that pattern.
//
// Idempotency: events are keyed on (externalOrderId + status); replays of
// the same status are no-ops because the DB UPDATE already lands on the
// destination state.

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { dispatchOrderEvent } from '@/lib/integration-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const eventSchema = z.object({
  externalOrderId: z.string().uuid(),
  /** Courier-side status. We map to HIR's status enum below. */
  status: z.enum([
    'CREATED',
    'OFFERED',
    'ACCEPTED',
    'PICKED_UP',
    'IN_TRANSIT',
    'DELIVERED',
    'CANCELLED',
  ]),
  deliveryOrderId: z.string().min(1).max(80).optional(),
  reason: z.string().trim().max(500).optional(),
  /** ISO timestamp for when the status transitioned (server-side). */
  at: z.string().datetime().optional(),
});

// Map courier-app statuses → HIR's restaurant_orders.status enum.
// HIR has: PENDING, CONFIRMED, PREPARING, READY, DISPATCHED, IN_DELIVERY,
//          DELIVERED, CANCELLED.
const STATUS_MAP: Record<string, string | null> = {
  CREATED: null, // we already set CONFIRMED on dispatch; ignore
  OFFERED: null, // courier-internal — restaurant doesn't care
  ACCEPTED: 'DISPATCHED',
  PICKED_UP: 'IN_DELIVERY',
  IN_TRANSIT: 'IN_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
};

function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header);
  if (!match) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // Constant-time compare to avoid timing leaks.
  const a = Buffer.from(match[1], 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const secret = process.env.COURIER_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 503 });
  }

  const rawBody = await req.text();
  if (!verifySignature(rawBody, req.headers.get('x-courier-signature'), secret)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_event', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const targetHirStatus = STATUS_MAP[parsed.data.status];
  if (!targetHirStatus) {
    // Internal courier transition we don't surface — accept + 200.
    return NextResponse.json({ ok: true, ignored: parsed.data.status });
  }

  const admin = getSupabaseAdmin();
  const { data: order, error: readErr } = await admin
    .from('restaurant_orders')
    .select('id, tenant_id, status, payment_status')
    .eq('id', parsed.data.externalOrderId)
    .maybeSingle();
  if (readErr || !order) {
    return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
  }

  // Don't regress already-terminal states. If the order is DELIVERED or
  // CANCELLED in HIR, ignore further courier events of that order.
  if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
    return NextResponse.json({ ok: true, ignored: 'terminal_state' });
  }

  const updates: { status: string; notes?: string } = { status: targetHirStatus };
  if (parsed.data.status === 'CANCELLED' && parsed.data.reason) {
    updates.notes = `[COURIER_CANCELLED] ${parsed.data.reason}`;
  }

  const { error: updErr } = await admin
    .from('restaurant_orders')
    .update(updates)
    .eq('id', order.id);
  if (updErr) {
    return NextResponse.json({ error: 'update_failed', detail: updErr.message }, { status: 500 });
  }

  // Cascade onto the integration bus so any POS adapter sees the change.
  await dispatchOrderEvent(
    order.tenant_id,
    parsed.data.status === 'CANCELLED' ? 'cancelled' : 'status_changed',
    {
      orderId: order.id,
      source: 'INTERNAL_STOREFRONT',
      status: targetHirStatus,
      items: [],
      totals: { subtotalRon: 0, deliveryFeeRon: 0, totalRon: 0 },
      customer: { firstName: '', phone: '' },
      dropoff: null,
      notes: parsed.data.reason ?? null,
    },
  );

  return NextResponse.json({ ok: true, status: targetHirStatus });
}
