import { NextResponse, type NextRequest } from 'next/server';

// Iulian directive 2026-05-16: Stripe is excluded from RSHIR's active payment
// path. This route was a Stripe Elements client-confirm fallback (verify the
// PaymentIntent server-side, flip payment_status → PAID). Post-Lane J the
// webhook was already the single source of truth, and post-Stripe-exclusion
// the route is dead code.
//
// We return 410 Gone for both POST and GET so any in-flight client that still
// holds an old build gets a clear, machine-readable signal rather than a 500
// from a deprecated `getStripe()` call. Payment confirmation is handled by
// the PSP webhooks at /api/webhooks/netopia (and /viva when V2 lands).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESPONSE_BODY = {
  error: 'stripe_confirm_deprecated',
  migration_doc: '/docs/payments-migration',
  message:
    'Stripe is deprecated in RSHIR. Card payments are confirmed via Netopia/Viva webhooks; the storefront no longer needs to call /api/checkout/confirm.',
} as const;

export async function POST(_req: NextRequest) {
  return NextResponse.json(RESPONSE_BODY, { status: 410 });
}

export async function GET(_req: NextRequest) {
  return NextResponse.json(RESPONSE_BODY, { status: 410 });
}
