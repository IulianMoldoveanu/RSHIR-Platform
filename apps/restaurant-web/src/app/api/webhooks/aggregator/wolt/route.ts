// HIR Restaurant Suite — Wolt aggregator webhook intake.
//
// Default-off behind WOLT_INTEGRATION_ENABLED. Until Iulian flips the
// flag + provides `WOLT_WEBHOOK_SECRET`, this route returns 503.
//
// Production flow (post-flag-flip):
//   1. Read raw body BEFORE any JSON parsing (HMAC needs untouched bytes).
//   2. woltAdapter.verifyWebhookWithSecret(ctx, raw, headers, { webhookSecret })
//      validates the signature + returns normalized AggregatorOrderEvent.
//   3. On success → INSERT INTO aggregator_webhook_events (provider,
//      provider_order_id) ON CONFLICT DO NOTHING for idempotency.
//   4. New row → push event into restaurant_orders ingest pipeline.
//   5. Always ack 200 to stop Wolt retries; 400 on permanent signature
//      failure (4xx = Wolt stops, 5xx = retries).
//
// Status: SCAFFOLD. Steps 3-4 land after the `aggregator_webhook_events`
// migration ships.

import { NextResponse } from 'next/server';
import { woltAdapter } from '@hir/integration-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (process.env.WOLT_INTEGRATION_ENABLED !== 'true') {
    return NextResponse.json({ error: 'wolt_integration_not_enabled' }, { status: 503 });
  }

  const webhookSecret = process.env.WOLT_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'wolt_webhook_secret_missing' }, { status: 503 });
  }

  const raw = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const event = await woltAdapter.verifyWebhookWithSecret(
    {
      fetch,
      log: (level, msg, meta) => {
        console[level === 'error' ? 'error' : 'log'](`[webhooks/wolt] ${msg}`, meta ?? {});
      },
    },
    raw,
    headers,
    { webhookSecret },
  );

  if (!event) {
    return NextResponse.json({ error: 'invalid_or_unmapped' }, { status: 400 });
  }

  console.log('[webhooks/wolt] received', {
    providerOrderId: event.providerOrderId,
    providerVenueId: event.providerVenueId,
    kind: event.kind,
    items: event.items.length,
  });

  return NextResponse.json({ received: true });
}
