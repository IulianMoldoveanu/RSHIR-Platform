import { NextResponse, type NextRequest } from 'next/server';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { assertSameOrigin } from '@/lib/origin-check';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { quoteRequestSchema } from '../schemas';
import { computeQuote, type QuoteFailure } from '../pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Quote failures that mean "a customer wanted delivery to a real address but we
// could not serve it" — the unmet-demand heatmap (the most valuable part of the
// demand map). Cart/config failures (ITEM_UNAVAILABLE, PROMO_INVALID, …) are
// NOT unmet demand and are excluded.
const UNMET_DEMAND_KINDS = new Set<QuoteFailure['kind']>([
  'OUTSIDE_ZONE',
  'ZONE_PAUSED',
  'NO_TIER',
]);

// Best-effort: records the signal and never throws — a telemetry failure must
// not break the quote response.
async function recordUnmetDemand(
  admin: ReturnType<typeof getSupabaseAdmin>,
  tenantId: string,
  reason: QuoteFailure,
  address: { lat: number; lng: number } | null,
): Promise<void> {
  if (!UNMET_DEMAND_KINDS.has(reason.kind) || !address) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).rpc('record_unmet_demand', {
      p_tenant_id: tenantId,
      p_signal_type: reason.kind,
      p_lat: address.lat,
      p_lng: address.lng,
      p_distance_km: reason.kind === 'NO_TIER' ? reason.distanceKm : null,
      p_reason: reason.kind === 'ZONE_PAUSED' ? reason.reason : null,
    });
  } catch {
    // swallow — unmet-demand capture is best-effort telemetry
  }
}

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

  const admin = getSupabaseAdmin();
  const result = await computeQuote(
    admin,
    { id: tenant.id, slug: tenant.slug, settings: tenant.settings },
    parsed.data.items,
    parsed.data.address ?? null,
    parsed.data.fulfillment,
    parsed.data.promoCode || null,
  );

  if (!result.ok) {
    await recordUnmetDemand(admin, tenant.id, result.reason, parsed.data.address ?? null);
    return NextResponse.json({ error: 'quote_failed', reason: result.reason }, { status: 422 });
  }

  return NextResponse.json({ quote: result.quote });
}
