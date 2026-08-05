// Reconciliation fallback for PSP webhook delivery gaps.
//
// Root cause (confirmed empirically 2026-07-27): a real Netopia sandbox
// payment came back error.code "00" / "Approved" when queried directly via
// /operation/status, but Netopia never called our notifyUrl — 0 rows ever
// landed in psp_webhook_events for that payment. This isn't a bug in our
// webhook route (it's reachable, verified via manual curl); Netopia's
// sandbox IPN delivery is simply not reliable enough to depend on
// exclusively. This cron actively polls for payments stuck PENDING and
// applies the same side effects the webhook would have.
//
// Auth: shared secret in the `x-cron-secret` header, same convention as the
// other Supabase-cron-triggered endpoints in this codebase
// (weather_cron_token, events_cron_token).

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { netopiaAdapter } from '@hir/integration-core';
import type { PspContext } from '@hir/integration-core';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  markOrderPaidAndDispatch,
  markOrderPaymentFailed,
  PaymentAmountMismatchError,
} from '@/app/api/checkout/order-finalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Only reconcile payments old enough that a normal webhook would already
// have arrived — avoids racing the happy-path webhook on a payment that's
// merely a few seconds old.
const MIN_AGE_MINUTES = 3;
// Cap per run so a bad batch can't turn into an unbounded loop of outbound
// calls to the gateway.
const MAX_PER_RUN = 25;

function buildNetopiaCtx(): PspContext | null {
  const live = process.env.NETOPIA_LIVE_MODE === 'true';
  const env = live ? 'LIVE' : 'SANDBOX';
  const signature = process.env[`NETOPIA_${env}_SIGNATURE`];
  const apiKey = process.env[`NETOPIA_${env}_API_KEY`];
  if (!signature || !apiKey) return null;

  return {
    credentials: { mode: 'STANDARD', signature, apiKey, live },
    fetch: globalThis.fetch.bind(globalThis),
    log: (level, msg, meta) => {
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
      fn(`[cron/reconcile-payments] ${msg}`, meta ?? {});
    },
  };
}

export async function POST(req: Request) {
  const expected = process.env.PSP_RECONCILE_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'reconcile_secret_not_configured' }, { status: 503 });
  }
  const got = req.headers.get('x-cron-secret') ?? '';
  const gotBuf = Buffer.from(got);
  const expectedBuf = Buffer.from(expected);
  const authorized =
    gotBuf.length === expectedBuf.length && timingSafeEqual(gotBuf, expectedBuf);
  if (!authorized) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const cutoff = new Date(Date.now() - MIN_AGE_MINUTES * 60_000).toISOString();
  const { data: pending, error: fetchErr } = await sb
    .from('psp_payments')
    .select('id, order_id, provider, provider_ref, status, created_at')
    .eq('provider', 'netopia')
    .in('status', ['PENDING'])
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN);

  if (fetchErr) {
    console.error('[cron/reconcile-payments] fetch failed', fetchErr.message);
    return NextResponse.json({ error: 'fetch_failed' }, { status: 500 });
  }
  if (!pending || pending.length === 0) {
    return NextResponse.json({ checked: 0, reconciled: 0 });
  }

  const ctx = buildNetopiaCtx();
  if (!ctx || !netopiaAdapter.getStatus) {
    return NextResponse.json({ error: 'netopia_status_unavailable' }, { status: 503 });
  }

  let reconciled = 0;
  const results: Array<{ orderId: string; outcome: string }> = [];

  for (const row of pending as Array<{
    id: string;
    order_id: string;
    provider: string;
    provider_ref: string;
    status: string;
  }>) {
    try {
      const statusResult = await netopiaAdapter.getStatus(ctx, {
        ntpId: row.provider_ref,
        orderId: row.order_id,
      });
      if (!statusResult.ok) {
        results.push({ orderId: row.order_id, outcome: `status_check_failed:${statusResult.error}` });
        continue;
      }

      if (statusResult.kind === 'payment.pending') {
        results.push({ orderId: row.order_id, outcome: 'still_pending' });
        continue;
      }

      if (statusResult.kind === 'payment.captured' || statusResult.kind === 'payment.authorized') {
        // Same CAS claim the webhook route uses, so a webhook that arrives
        // late (or a concurrent cron run) can't double-dispatch.
        const claim = await sb
          .from('psp_payments')
          .update({ status: 'CAPTURED', updated_at: new Date().toISOString() })
          .eq('id', row.id)
          .eq('status', row.status)
          .select('id');
        if (claim.data && claim.data.length > 0) {
          try {
            // Pass the amount Netopia reports so a short/partial capture is
            // rejected before the order is marked PAID (security B1).
            await markOrderPaidAndDispatch(row.order_id, statusResult.amountBani);
            reconciled++;
            results.push({ orderId: row.order_id, outcome: 'reconciled_paid' });
            Sentry.addBreadcrumb({
              category: 'cron.reconcile_payments',
              message: 'order.reconciled_paid',
              level: 'info',
              data: { orderId: row.order_id, provider: row.provider },
            });
          } catch (finalizeErr) {
            if (finalizeErr instanceof PaymentAmountMismatchError) {
              // Move to FAILED (only terminal non-paid status the CHECK
              // constraint allows) so the order is not treated as paid, and
              // surface loudly. Do NOT count as reconciled. The Sentry event +
              // log carry the real amount_mismatch reason.
              await sb
                .from('psp_payments')
                .update({ status: 'FAILED', updated_at: new Date().toISOString() })
                .eq('id', row.id);
              console.error('[cron/reconcile-payments] amount mismatch — order NOT marked paid', {
                orderId: finalizeErr.orderId,
                expectedBani: finalizeErr.expectedBani,
                capturedBani: finalizeErr.capturedBani,
              });
              Sentry.captureException(finalizeErr, {
                tags: { subsystem: 'cron.reconcile_payments', side_effect: 'amount_mismatch' },
                extra: {
                  orderId: finalizeErr.orderId,
                  expectedBani: finalizeErr.expectedBani,
                  capturedBani: finalizeErr.capturedBani,
                },
                fingerprint: ['cron.reconcile_payments.amount_mismatch'],
              });
              results.push({ orderId: row.order_id, outcome: 'amount_mismatch' });
            } else {
              throw finalizeErr;
            }
          }
        } else {
          results.push({ orderId: row.order_id, outcome: 'race_lost' });
        }
      } else if (statusResult.kind === 'payment.failed') {
        await sb
          .from('psp_payments')
          .update({ status: 'FAILED', updated_at: new Date().toISOString() })
          .eq('id', row.id)
          .eq('status', row.status);
        await markOrderPaymentFailed(row.order_id);
        reconciled++;
        results.push({ orderId: row.order_id, outcome: 'reconciled_failed' });
      } else if (statusResult.kind === 'payment.refunded') {
        await sb
          .from('psp_payments')
          .update({ status: 'REFUNDED', updated_at: new Date().toISOString() })
          .eq('id', row.id)
          .eq('status', row.status);
        results.push({ orderId: row.order_id, outcome: 'reconciled_refunded' });
      }
    } catch (err) {
      console.error('[cron/reconcile-payments] row failed', {
        orderId: row.order_id,
        err: (err as Error).message,
      });
      Sentry.captureException(err, {
        tags: { subsystem: 'cron.reconcile_payments' },
        extra: { orderId: row.order_id, providerRef: row.provider_ref },
      });
      results.push({ orderId: row.order_id, outcome: 'exception' });
    }
  }

  return NextResponse.json({ checked: pending.length, reconciled, results });
}
