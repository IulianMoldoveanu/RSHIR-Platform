import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe/server';
import {
  markOrderPaidAndDispatch,
  markOrderPaymentFailed,
} from '../../checkout/order-finalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 503 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 400 });
  }

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    // Don't echo the verifier's diagnostic to the caller — even though Stripe's
    // own messages are crafted to be safe, an attacker probing signatures gets
    // free debugging hints. Log server-side, return generic 400.
    console.error('[webhooks/stripe] signature verification failed', (err as Error).message);
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const intent = event.data.object as Stripe.PaymentIntent;
      const orderId = intent.metadata?.order_id;
      if (orderId) await markOrderPaidAndDispatch(orderId);
      break;
    }
    case 'payment_intent.payment_failed': {
      const intent = event.data.object as Stripe.PaymentIntent;
      const orderId = intent.metadata?.order_id;
      if (orderId) await markOrderPaymentFailed(orderId);
      break;
    }
    default:
      // ignore other events
      break;
  }

  return NextResponse.json({ received: true });
}
