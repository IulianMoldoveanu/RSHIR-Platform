// HIR Restaurant Suite — Stripe Connect webhook intake (Lane PSP-MULTIGATES-V1).
//
// Separate from the legacy /api/webhooks/stripe route (which handles direct
// platform charges + dispute mirroring). This route is for Stripe CONNECT
// events on connected accounts (direct charges to tenant connected accounts
// with HIR collecting application_fee_amount).
//
// Default-off behind STRIPE_CONNECT_ENABLED env flag — matches the Netopia
// scaffold gating pattern. Until Iulian flips the flag and provides
// STRIPE_CONNECT_WEBHOOK_SECRET, this route returns 503.
//
// Idempotency: UNIQUE(provider, event_id) on psp_webhook_events.
// We INSERT first; if the insert claims a row, we run side-effects.
// 23505 (unique violation) → return 200 with duplicate flag.

import { NextResponse } from 'next/server';
import { stripeConnectAdapter, type PspContext } from '@hir/integration-core';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (process.env.STRIPE_CONNECT_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'stripe_connect_not_enabled' },
      { status: 503 },
    );
  }

  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'stripe_connect_webhook_secret_missing' },
      { status: 503 },
    );
  }

  const raw = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  // The adapter overloads `credentials.apiKey` to mean "verification secret"
  // when called via verifyWebhook. Mirrors the Netopia adapter pattern —
  // keeps the contract tight at 4 methods rather than introducing a fifth
  // for verification key plumbing.
  const ctx: PspContext = {
    credentials: {
      mode: 'STANDARD',
      signature: '',
      apiKey: webhookSecret,
      live: process.env.STRIPE_LIVE_MODE === '1',
    },
    fetch,
    log: (level, msg, meta) => {
      // Server-side only; ops can grep on these prefixes.
      console[level === 'error' ? 'error' : 'log'](
        `[webhooks/stripe-connect] ${msg}`,
        meta ?? {},
      );
    },
  };

  const event = await stripeConnectAdapter.verifyWebhook(ctx, raw, headers);
  if (!event) {
    // Either signature failed or event type isn't one we map. Return 400
    // for signature failures (Stripe retries on 5xx but stops on 4xx —
    // a permanent signature mismatch should NOT be retried), 200 for
    // unmapped events (we ack so Stripe stops). The adapter doesn't
    // distinguish, so we conservatively return 400 here. If unmapped
    // events become noisy ops can flip this to 200.
    return NextResponse.json({ error: 'invalid_or_unmapped' }, { status: 400 });
  }

  // Idempotency. UNIQUE(provider, event_id) on psp_webhook_events.
  const admin = getSupabaseAdmin();
  // psp_webhook_events isn't in the generated Database types yet; cast
  // through unknown — same pattern used elsewhere for newly-shipped tables.
  const sb = admin as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => Promise<{
        error: { code?: string; message?: string } | null;
      }>;
    };
  };

  const { error: insertErr } = await sb.from('psp_webhook_events').insert({
    provider: 'stripe_connect',
    event_id: event.eventId,
    event_type: event.kind,
    raw_payload: JSON.parse(raw),
  });

  if (insertErr) {
    if (insertErr.code === '23505') {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error(
      '[webhooks/stripe-connect] idempotency insert failed',
      insertErr.message,
    );
    return NextResponse.json(
      { error: 'idempotency_store_failed' },
      { status: 500 },
    );
  }

  // Side-effects (mark order paid / failed / refunded) land in V2 along
  // with end-to-end smoke against Stripe Connect test mode. Today the
  // event log is sufficient — the route claims the row and Stripe stops
  // retrying. This matches the V1 Netopia scaffold philosophy: log first,
  // mutate orders only after Iulian smokes the full flow.

  return NextResponse.json({ received: true });
}
