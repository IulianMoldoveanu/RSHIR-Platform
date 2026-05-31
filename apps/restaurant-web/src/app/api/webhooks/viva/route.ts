// HIR Restaurant Suite — Viva Wallet webhook intake (V2).
//
// Handles two request types from Viva:
//   GET  — endpoint verification handshake (Viva sends ActorId param,
//          we respond with { key: VIVA_WEBHOOK_KEY } so Viva knows the
//          endpoint is live and belongs to us).
//   POST — event delivery (Transaction Payment Created, Failed, Refunded).
//
// Gated by VIVA_ENABLED env flag; returns 503 when unset so the route is
// safe to deploy without exposing an unfinished payment surface.
// Idempotency: UNIQUE(provider, event_id) on psp_webhook_events — same
// pattern as /api/webhooks/netopia and /api/webhooks/stripe-connect.
//
// Side-effects after idempotency claim:
//   payment.captured  → mark order PAID + dispatch to courier
//   payment.failed    → mark order payment_status = FAILED
//   payment.refunded  → mark order payment_status = REFUNDED

import { NextResponse } from 'next/server';
import { vivaAdapter } from '@hir/integration-core';
import type { PspContext } from '@hir/integration-core';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  markOrderPaidAndDispatch,
  markOrderPaymentFailed,
} from '@/app/api/checkout/order-finalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function notEnabled() {
  return NextResponse.json({ error: 'viva_not_enabled' }, { status: 503 });
}

// Viva GET handshake: respond with the webhook key so Viva confirms the endpoint.
export async function GET(_req: Request) {
  if (process.env.VIVA_ENABLED !== 'true') return notEnabled();
  const webhookKey = process.env.VIVA_WEBHOOK_KEY;
  if (!webhookKey) {
    return NextResponse.json({ error: 'viva_webhook_key_missing' }, { status: 503 });
  }
  return NextResponse.json({ key: webhookKey });
}

export async function POST(req: Request) {
  if (process.env.VIVA_ENABLED !== 'true') return notEnabled();

  const raw = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const ctx: PspContext = {
    credentials: {
      mode: 'STANDARD',
      signature: '',
      apiKey: '',
      webhookSecret: process.env.VIVA_WEBHOOK_KEY,
      live: process.env.VIVA_LIVE_MODE === 'true',
    },
    fetch: globalThis.fetch.bind(globalThis),
    log: (level, msg, meta) => {
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
      fn(`[webhooks/viva] ${msg}`, meta ?? {});
    },
  };

  const event = await vivaAdapter.verifyWebhook(ctx, raw, headers);
  if (!event) {
    // Signature mismatch or unmapped event type.
    // Return 400 for mismatch (Viva stops retrying on 4xx).
    console.warn('[webhooks/viva] rejected: invalid_or_unmapped');
    return NextResponse.json({ error: 'invalid_or_unmapped' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { error: insertErr } = await sb.from('psp_webhook_events').insert({
    provider: 'viva',
    event_id: event.eventId,
    event_type: event.kind,
    raw_payload: JSON.parse(raw),
  });

  if (insertErr) {
    if (insertErr.code === '23505') {
      // Duplicate delivery — already processed.
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error('[webhooks/viva] idempotency insert failed', insertErr.message);
    return NextResponse.json({ error: 'idempotency_store_failed' }, { status: 500 });
  }

  // Resolve the HIR order linked to this gateway provider_ref.
  const orderId = await resolveOrderId(sb, 'viva', event.providerRef);

  if (orderId) {
    try {
      if (event.kind === 'payment.captured') {
        await markOrderPaidAndDispatch(orderId);
      } else if (event.kind === 'payment.failed') {
        await markOrderPaymentFailed(orderId);
      } else if (event.kind === 'payment.refunded') {
        await sb
          .from('restaurant_orders')
          .update({ payment_status: 'REFUNDED' })
          .eq('id', orderId)
          .eq('payment_status', 'PAID');
      }
    } catch (err) {
      // Log but do not re-raise — returning 500 would cause Viva to retry,
      // and the idempotency row is already inserted so we would skip the retry
      // insert and never reach side-effects again. The event is persisted for
      // manual reconciliation.
      console.error('[webhooks/viva] side-effect failed', {
        kind: event.kind,
        orderId,
        err: (err as Error).message,
      });
    }
  } else {
    console.warn('[webhooks/viva] no psp_payments row for provider_ref', {
      providerRef: event.providerRef,
    });
  }

  return NextResponse.json({ received: true });
}

/**
 * Look up the HIR order id from psp_payments using the gateway's provider_ref.
 * Returns null when no matching row exists. Never throws.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveOrderId(sb: any, provider: string, providerRef: string): Promise<string | null> {
  try {
    const { data } = await sb
      .from('psp_payments')
      .select('order_id')
      .eq('provider', provider)
      .eq('provider_ref', providerRef)
      .maybeSingle();
    return (data?.order_id as string | null | undefined) ?? null;
  } catch {
    return null;
  }
}
