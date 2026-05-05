import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  markOrderPaidAndDispatch,
  markOrderPaymentFailed,
  markOrderRefunded,
  recordDisputeEvent,
} from '../../checkout/order-finalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lane G + payment-lifecycle — events we act on. Anything else is silently
// ignored (return 200 so Stripe stops retrying). Listing them up-front lets
// ops grep for "what events does the webhook handle?" without reading the
// switch.
const HANDLED_EVENTS = [
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.refunded',
  // payment-lifecycle PR 2: dispute INTAKE only (no money movement).
  // Stripe drives the chargeback state machine; we mirror it into
  // payment_disputes for visibility and flag the order as disputed=true.
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated',
] as const;
type HandledEvent = (typeof HANDLED_EVENTS)[number];

function isHandled(t: string): t is HandledEvent {
  return (HANDLED_EVENTS as readonly string[]).includes(t);
}

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

  // Skip idempotency + side-effects for events we don't act on. Stripe
  // delivers ~50 event types per integration; we only care about a handful.
  // Logging every payment_intent.created/processing/etc. into
  // stripe_events_processed would balloon the table without buying anything.
  if (!isHandled(event.type)) {
    return NextResponse.json({ received: true, handled: false });
  }

  // Idempotency. Stripe retries failed webhook deliveries for up to 3 days
  // with exponential backoff. Without this guard a transient 500 in our
  // handler would replay the side effects (audit emit, courier dispatch)
  // on every retry. UNIQUE constraint on event.id is the source of truth —
  // we attempt the insert FIRST, and only run side effects when the insert
  // claims a new row.
  const admin = getSupabaseAdmin();
  // The stripe_events_processed table ships in 20260504_003 — supabase-types
  // regenerates post-merge, so we cast through `any` here (same pattern used
  // for the orders.payment_method column in checkout/intent before its types
  // were regenerated). Removing this cast is a no-op typecheck once
  // `pnpm gen:supabase-types` lands the new table definitions.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any;
  const { error: insertErr } = await adminAny
    .from('stripe_events_processed')
    .insert({ id: event.id, event_type: event.type });

  if (insertErr) {
    // 23505 = unique_violation — already processed, return 200 so Stripe
    // stops retrying. Any other error we surface as 500 so Stripe DOES
    // retry (transient DB issue, not a duplicate).
    if ((insertErr as { code?: string }).code === '23505') {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error('[webhooks/stripe] idempotency insert failed', insertErr.message);
    return NextResponse.json({ error: 'idempotency_store_failed' }, { status: 500 });
  }

  try {
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
        // Don't auto-cancel the order — give the customer a chance to retry
        // payment from the storefront. The order stays UNPAID/PENDING; the
        // /track page surfaces a "Re-încercați plata" CTA when applicable.
        if (orderId) await markOrderPaymentFailed(orderId);
        break;
      }
      case 'charge.refunded': {
        // The charge.refunded event arrives after a refund completes (full
        // or partial). PaymentIntent id is on the charge object; we pull
        // the matching order via the existing stripe_payment_intent_id link.
        // Observation-only — the refund has already been executed by Stripe
        // (either via PR 3 admin action once that lands, or via Stripe
        // dashboard / dispute resolution). We mirror state, do not initiate.
        const charge = event.data.object as Stripe.Charge;
        const intentId =
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent?.id ?? null;
        if (intentId) {
          await markOrderRefunded(intentId, {
            amountBani:
              typeof charge.amount_refunded === 'number' ? charge.amount_refunded : null,
            reason: charge.refunds?.data?.[0]?.reason ?? null,
          });
        }
        break;
      }
      // payment-lifecycle PR 2: dispute INTAKE only. We never call
      // stripe.disputes.update / .submit from here — that's the merchant's
      // responsibility via Stripe dashboard until we build evidence-submission
      // UI in a later PR. All five events funnel through recordDisputeEvent
      // which upserts payment_disputes + flips orders.disputed when needed.
      case 'charge.dispute.created':
      case 'charge.dispute.updated':
      case 'charge.dispute.closed':
      case 'charge.dispute.funds_withdrawn':
      case 'charge.dispute.funds_reinstated': {
        const dispute = event.data.object as Stripe.Dispute;
        await recordDisputeEvent(event.type, dispute);
        break;
      }
    }
  } catch (handlerErr) {
    // Side-effect failed AFTER we claimed the idempotency row. We rollback
    // the row so Stripe can retry — otherwise we'd be stuck in a state where
    // the event is "processed" in our table but the order wasn't updated.
    await adminAny.from('stripe_events_processed').delete().eq('id', event.id);
    console.error(
      '[webhooks/stripe] handler failed, rolled back idempotency row',
      (handlerErr as Error).message,
    );
    return NextResponse.json({ error: 'handler_failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
