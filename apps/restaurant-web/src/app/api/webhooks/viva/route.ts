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

import { NextResponse } from 'next/server';
import { vivaAdapter } from '@hir/integration-core';
import type { PspContext } from '@hir/integration-core';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

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
    return NextResponse.json({ error: 'invalid_or_unmapped' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const sb = admin as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => Promise<{
        error: { code?: string; message?: string } | null;
      }>;
    };
  };

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

  // Side-effects (mark order paid / failed / refunded) land in V2 along
  // with end-to-end smoke against Viva sandbox. Today the event log is
  // sufficient — we claim the row and Viva stops retrying.

  return NextResponse.json({ received: true });
}
