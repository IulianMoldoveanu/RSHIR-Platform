import { NextResponse } from 'next/server';

// Iulian directive 2026-05-16: Stripe is excluded from RSHIR's active
// payment path. Card webhooks ship via Netopia (`/api/webhooks/netopia`) and
// Viva (TBD) instead.
//
// This route is preserved so any in-flight Stripe webhook delivery gets a
// clear, machine-readable signal rather than silent 404. We respond with
// 410 Gone — Stripe stops retrying on 4xx that aren't 408/429, and 410
// communicates "permanently removed" to ops dashboards. Body carries the
// migration pointer so a human investigating sees where to look next.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESPONSE_BODY = {
  error: 'stripe_deprecated',
  migration_doc: '/docs/payments-migration',
  message:
    'Stripe is deprecated in RSHIR. Card webhooks are handled by Netopia at /api/webhooks/netopia and Viva at /api/webhooks/viva.',
} as const;

export async function POST(_req: Request) {
  return NextResponse.json(RESPONSE_BODY, { status: 410 });
}

export async function GET(_req: Request) {
  return NextResponse.json(RESPONSE_BODY, { status: 410 });
}
