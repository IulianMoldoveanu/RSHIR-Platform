import { NextResponse, type NextRequest } from 'next/server';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe/server';
import { assertSameOrigin } from '@/lib/origin-check';
import { confirmRequestSchema } from '../schemas';
import { markOrderPaidAndDispatch } from '../order-finalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Client calls this after Stripe Elements has confirmed the PaymentIntent.
 * We verify with Stripe (defense-in-depth alongside the webhook), then flip
 * payment_status → PAID and kick off the delivery handoff.
 */
export async function POST(req: NextRequest) {
  // Same-origin gate. The webhook is the source of truth for payment events;
  // this client-driven confirm is an optimization to flip the UI faster. A
  // cross-origin caller could attempt to fast-path mark someone else's order
  // CONFIRMED — Stripe verification still gates the actual update, but we
  // close the door earlier.
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json(
      { error: 'forbidden_origin', reason: origin.reason },
      { status: 403 },
    );
  }

  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = confirmRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: order, error } = await admin
    .from('restaurant_orders')
    .select('id, stripe_payment_intent_id, payment_status, public_track_token')
    .eq('id', parsed.data.orderId)
    .eq('tenant_id', tenant.id)
    .single();
  if (error || !order) {
    return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
  }

  if (order.payment_status === 'PAID') {
    return NextResponse.json({ ok: true, publicTrackToken: order.public_track_token });
  }

  if (!order.stripe_payment_intent_id) {
    return NextResponse.json({ error: 'no_payment_intent' }, { status: 409 });
  }

  const intent = await getStripe().paymentIntents.retrieve(order.stripe_payment_intent_id);
  if (intent.status !== 'succeeded') {
    return NextResponse.json({ error: 'payment_not_succeeded', status: intent.status }, { status: 409 });
  }

  await markOrderPaidAndDispatch(order.id);

  return NextResponse.json({ ok: true, publicTrackToken: order.public_track_token });
}
