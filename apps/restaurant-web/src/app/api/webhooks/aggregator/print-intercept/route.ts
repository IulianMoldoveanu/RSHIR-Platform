// HIR Restaurant Suite — Print Intercept aggregator webhook intake.
//
// Receives parsed printout payloads from the HIR print-intercept
// companion (Android / Raspberry Pi). Default-off behind
// PRINT_INTERCEPT_ENABLED. HMAC-verified per per-restaurant secret.

import { NextResponse } from 'next/server';
import { printInterceptAdapter } from '@hir/integration-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (process.env.PRINT_INTERCEPT_ENABLED !== 'true') {
    return NextResponse.json({ error: 'print_intercept_not_enabled' }, { status: 503 });
  }

  // V1 ships with a single shared secret. V2 swaps for per-restaurant
  // secrets looked up from `tenants.settings.print_intercept.secret`
  // (encrypted at rest via Vault).
  const webhookSecret = process.env.PRINT_INTERCEPT_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'print_intercept_secret_missing' }, { status: 503 });
  }

  const raw = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const event = await printInterceptAdapter.verifyWebhookWithSecret(
    {
      fetch,
      log: (level, msg, meta) => {
        console[level === 'error' ? 'error' : 'log'](
          `[webhooks/print-intercept] ${msg}`,
          meta ?? {},
        );
      },
    },
    raw,
    headers,
    { webhookSecret },
  );

  if (!event) {
    return NextResponse.json({ error: 'invalid_or_unparsable' }, { status: 400 });
  }

  console.log('[webhooks/print-intercept] received', {
    providerOrderId: event.providerOrderId,
    provider: event.source.type,
    items: event.items.length,
  });

  return NextResponse.json({ received: true });
}
