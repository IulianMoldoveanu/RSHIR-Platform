// HIR Restaurant Suite — Netopia webhook intake (V2).
//
// Reads raw body before JSON parsing so HMAC-SHA256 verification works.
// Idempotency via UNIQUE(provider, event_id) on psp_webhook_events.
// Gated by NETOPIA_ENABLED env flag.

import { NextResponse } from 'next/server';
import { netopiaAdapter } from '@hir/integration-core';
import type { PspContext } from '@hir/integration-core';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

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
    provider: 'netopia',
    event_id: event.eventId,
    event_type: event.kind,
    raw_payload: JSON.parse(raw),
  });

  if (insertErr) {
    if (insertErr.code === '23505') {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error('[webhooks/netopia] idempotency insert failed', insertErr.message);
    return NextResponse.json({ error: 'idempotency_store_failed' }, { status: 500 });
  }

  // Side-effects (mark order paid) land in V2 after Iulian smokes the full
  // flow against Netopia sandbox. Event log alone stops retries for now.

  return NextResponse.json({ received: true });
}
