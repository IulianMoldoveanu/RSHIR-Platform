import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe/server';
import { confirmRequestSchema } from '../schemas';
import { markOrderPaidAndDispatch } from '../order-finalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Client calls this after Stripe Elements has confirmed the PaymentIntent.
 * We verify with Stripe (defense-in-depth alongside the webhook), then flip
 * payment_status → PAID and kick off the delivery handoff.
 */
export async function POST(req: Request) {
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
