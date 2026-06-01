// HIR Restaurant Suite — Netopia webhook intake (V2).
//
// Reads raw body before JSON parsing so HMAC-SHA256 verification works.
// Idempotency via UNIQUE(provider, event_id) on psp_webhook_events.
// Gated by NETOPIA_ENABLED env flag.
//
// Side-effects after idempotency claim:
//   payment.captured   → mark order PAID + dispatch to courier
//   payment.authorized → treat as captured (Netopia v2 auto-captures)
//   payment.failed     → mark order payment_status = FAILED
//   payment.refunded   → mark order payment_status = REFUNDED

import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { netopiaAdapter } from '@hir/integration-core';
import type { PspContext } from '@hir/integration-core';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  markOrderPaidAndDispatch,
  markOrderPaymentFailed,
} from '@/app/api/checkout/order-finalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (process.env.NETOPIA_ENABLED !== 'true') {
    return NextResponse.json({ error: 'netopia_not_enabled' }, { status: 503 });
  }

  const raw = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  Sentry.addBreadcrumb({ category: 'webhook.netopia', message: 'webhook.received', level: 'info' });

  const ctx: PspContext = {
    credentials: {
      mode: 'STANDARD',
      signature: '',
      apiKey: '',
      webhookSecret: process.env.NETOPIA_WEBHOOK_SECRET,
      live: process.env.NETOPIA_LIVE_MODE === 'true',
    },
    fetch: globalThis.fetch.bind(globalThis),
    log: (level, msg, meta) => {
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
      fn(`[webhooks/netopia] ${msg}`, meta ?? {});
    },
  };

  const event = await netopiaAdapter.verifyWebhook(ctx, raw, headers);
  if (!event) {
    // Signature mismatch or unmapped status. 400 stops Netopia retries.
    console.warn('[webhooks/netopia] rejected: invalid_or_unmapped');
    return NextResponse.json({ error: 'invalid_or_unmapped' }, { status: 400 });
  }

  Sentry.addBreadcrumb({
    category: 'webhook.netopia',
    message: 'webhook.verified',
    level: 'info',
    data: { kind: event.kind, providerRef: event.providerRef },
  });

  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { error: insertErr } = await sb.from('psp_webhook_events').insert({
    provider: 'netopia',
    event_id: event.eventId,
    event_type: event.kind,
    raw_payload: JSON.parse(raw),
  });

  if (insertErr) {
    if (insertErr.code === '23505') {
      // Duplicate delivery — already processed.
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error('[webhooks/netopia] idempotency insert failed', insertErr.message);
    return NextResponse.json({ error: 'idempotency_store_failed' }, { status: 500 });
  }

  // Resolve the HIR order linked to this gateway provider_ref.
  const pspRow = await resolvePspPayment(sb, 'netopia', event.providerRef);

  if (pspRow) {
    Sentry.addBreadcrumb({
      category: 'webhook.netopia',
      message: 'order.found',
      level: 'info',
      data: { orderId: pspRow.orderId, currentStatus: pspRow.status },
    });

    try {
      if (event.kind === 'payment.captured' || event.kind === 'payment.authorized') {
        // Idempotency: skip if the psp_payments row is already CAPTURED to
        // avoid a duplicate markOrderPaidAndDispatch on webhook replays.
        if (pspRow.status === 'CAPTURED') {
          return NextResponse.json({ received: true, duplicate: true });
        }
        Sentry.addBreadcrumb({ category: 'webhook.netopia', message: 'order.marked_paid', level: 'info', data: { orderId: pspRow.orderId } });
        await markOrderPaidAndDispatch(pspRow.orderId);
        Sentry.addBreadcrumb({ category: 'webhook.netopia', message: 'dispatch.triggered', level: 'info', data: { orderId: pspRow.orderId } });
        await sb
          .from('psp_payments')
          .update({ status: 'CAPTURED', updated_at: new Date().toISOString() })
          .eq('provider', 'netopia')
          .eq('provider_ref', event.providerRef);
      } else if (event.kind === 'payment.failed') {
        await markOrderPaymentFailed(pspRow.orderId);
        await sb
          .from('psp_payments')
          .update({ status: 'FAILED', updated_at: new Date().toISOString() })
          .eq('provider', 'netopia')
          .eq('provider_ref', event.providerRef);
      } else if (event.kind === 'payment.refunded') {
        await sb
          .from('restaurant_orders')
          .update({ payment_status: 'REFUNDED' })
          .eq('id', pspRow.orderId)
          .eq('payment_status', 'PAID');
        await sb
          .from('psp_payments')
          .update({ status: 'REFUNDED', updated_at: new Date().toISOString() })
          .eq('provider', 'netopia')
          .eq('provider_ref', event.providerRef);
      }
    } catch (err) {
      // Log but do not re-raise — returning 500 would cause Netopia to retry,
      // and the idempotency row is already inserted so we would skip the retry
      // insert and never reach side-effects again. The event is persisted for
      // manual reconciliation.
      console.error('[webhooks/netopia] side-effect failed', {
        kind: event.kind,
        orderId: pspRow.orderId,
        err: (err as Error).message,
      });
    }
  } else {
    console.warn('[webhooks/netopia] no psp_payments row for provider_ref', {
      providerRef: event.providerRef,
    });
  }

  return NextResponse.json({ received: true });
}

type PspPaymentRow = { orderId: string; status: string };

/**
 * Look up the HIR order id + current status from psp_payments using the
 * gateway's provider_ref. Returns null when no matching row exists. Never throws.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolvePspPayment(sb: any, provider: string, providerRef: string): Promise<PspPaymentRow | null> {
  try {
    const { data } = await sb
      .from('psp_payments')
      .select('order_id, status')
      .eq('provider', provider)
      .eq('provider_ref', providerRef)
      .maybeSingle();
    if (!data?.order_id) return null;
    return { orderId: data.order_id as string, status: (data.status as string | undefined) ?? 'PENDING' };
  } catch {
    return null;
  }
}
