// HIR Restaurant Suite — Netopia payment intent endpoint (V1 scaffold).
//
// Default-off behind NETOPIA_ENABLED env flag. When the flag is unset or
// "false" the route returns 503 — this lets us deploy the scaffold to
// production without exposing an unfinished payment surface. V2 will
// flip the flag once Iulian smokes the adapter against Netopia sandbox.
//
// Mode (MARKETPLACE vs STANDARD) is read from psp_credentials per-tenant
// at call time — the adapter handles both with one code path.

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request) {
  if (process.env.NETOPIA_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'netopia_not_enabled' },
      { status: 503 },
    );
  }

  // V2 lands the real flow:
  //   1. Resolve tenant + order from request body (signed checkout token)
  //   2. Load psp_credentials row (admin client, decrypt api_key)
  //   3. Insert psp_payments row (PENDING)
  //   4. Call netopiaAdapter.createIntent(...)
  //   5. Return { redirectUrl } on success, 502 on adapter failure
  return NextResponse.json(
    { error: 'netopia_adapter_v1_scaffold_only' },
    { status: 503 },
  );
}
