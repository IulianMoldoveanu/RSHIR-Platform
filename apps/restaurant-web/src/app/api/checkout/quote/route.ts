import { NextResponse, type NextRequest } from 'next/server';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { assertSameOrigin } from '@/lib/origin-check';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { quoteRequestSchema } from '../schemas';
import { computeQuote } from '../pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Quote is the public price oracle — gives back delivery fee, promo
  // validity, pickup gating. Scripted enumeration could probe promo codes
  // or be used to fingerprint tenants. 30 quotes per IP per minute
  // (capacity 30, refill 1/2s) easily covers cart re-pricing.
  const rl = checkLimit(`checkout-quote:${clientIp(req)}`, { capacity: 30, refillPerSec: 1 / 2 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  // Same-origin gate — quote is server-priced (price/promo lookup) and
  // accepting cross-origin POSTs would let third-party pages probe pricing,
  // promo validity, and pickup gating against any tenant the victim's
  // browser has visited.
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json(
      { error: 'forbidden_origin', reason: origin.reason },
      { status: 403 },
    );
  }

  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = quoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request', issues: parsed.error.flatten() }, { status: 400 });
  }

  // RSHIR-32 M-2: server-enforce pickup_enabled. The storefront UI hides
  // the radio when disabled, but a scripted client could POST PICKUP +
  // 0 fee against a tenant that has not opted in.
  if (parsed.data.fulfillment === 'PICKUP') {
    const pickupEnabled = (tenant.settings as Record<string, unknown> | null)?.pickup_enabled;
    if (pickupEnabled === false) {
      return NextResponse.json({ error: 'pickup_disabled' }, { status: 422 });
    }
  }

  const result = await computeQuote(
    getSupabaseAdmin(),
    { id: tenant.id, slug: tenant.slug, settings: tenant.settings },
    parsed.data.items,
    parsed.data.address ?? null,
    parsed.data.fulfillment,
    parsed.data.promoCode || null,
  );

  if (!result.ok) {
    return NextResponse.json({ error: 'quote_failed', reason: result.reason }, { status: 422 });
  }

  return NextResponse.json({ quote: result.quote });
}
