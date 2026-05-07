// HIR Restaurant Suite — Netopia webhook intake (V1 scaffold).
//
// Mirrors the Stripe webhook at ../stripe/route.ts:
//   - Reads raw body BEFORE any JSON parsing so HMAC verification works
//   - Idempotency via UNIQUE(provider, event_id) on psp_webhook_events
//   - Default-off behind NETOPIA_ENABLED until V2 ships real verifier
//
// V2 wires the real handler. V1 is deliberately a 503 stub — Netopia
// retries failed deliveries; we don't want to half-process events while
// the verifier is still scaffold.

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (process.env.NETOPIA_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'netopia_not_enabled' },
      { status: 503 },
    );
  }

  const _raw = await req.text();
  // V2:
  //   1. netopiaAdapter.verifyWebhook(ctx, _raw, headers)
  //   2. INSERT INTO psp_webhook_events ON CONFLICT DO NOTHING
  //   3. If new row → side-effects (mark order paid, trigger dispatch)
  //   4. Return 200 { received: true }
  return NextResponse.json(
    { error: 'netopia_adapter_v1_scaffold_only' },
    { status: 503 },
  );
}
