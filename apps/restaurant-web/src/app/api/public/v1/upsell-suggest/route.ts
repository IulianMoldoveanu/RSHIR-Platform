// POST /api/public/v1/upsell-suggest
// Returns co-occurrence cross-sell recommendations for items currently in a customer's cart.
// Called from the restaurant's own site BEFORE checkout completion.
//
// Auth: same Bearer key pattern as /api/public/v1/orders (integration_api_keys).
// Scope required: 'upsell.read' — tenants must add this scope when creating keys
//   (or we add it as a broadly-granted read scope in the admin panel; that's a V2 decision).
//   For now: any active key for the tenant is accepted (mirrors the orders route intent).
// Rate limit: 1000 req/min per API key (token bucket, in-memory).
// Cache: in-process Map with 5-min TTL keyed on tenant + sorted cart item IDs.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkLimit } from '@/lib/rate-limit';
import { authenticateBearerKey } from '../auth';
import { getUpsellSuggestions } from '@/lib/upsell';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const upsellBodySchema = z.object({
  customer_phone: z.string().trim().min(6).max(40).optional(),
  items_in_cart: z
    .array(
      z.object({
        item_id: z.string().uuid(),
        qty: z.number().int().positive().max(99),
      }),
    )
    .min(1)
    .max(50),
  subtotal_cents: z.number().int().nonnegative().optional(),
  context: z.enum(['checkout', 'menu_browse']).optional(),
});

// ---------------------------------------------------------------------------
// In-process suggestion cache (per Vercel function instance — good enough for MVP)
// ---------------------------------------------------------------------------

type CacheEntry = {
  payload: string; // pre-serialised JSON
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheKey(tenantId: string, itemIds: string[]): string {
  return `upsell:${tenantId}:${[...itemIds].sort().join(',')}`;
}

function getCached(key: string): string | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.payload;
}

function setCached(key: string, payload: string): void {
  // Simple cap — evict all expired entries when the map grows large
  if (cache.size >= 5_000) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now > v.expiresAt) cache.delete(k);
    }
  }
  cache.set(key, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  // 1. Auth
  const authed = await authenticateBearerKey(req.headers.get('authorization'));
  if (!authed) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 2. Rate limit: 1000 req/min → refill ~16.67/sec
  const rl = checkLimit(`pub-upsell:${authed.keyId}`, {
    capacity: 1000,
    refillPerSec: 1000 / 60,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  // 3. Parse body
  const body = await req.json().catch(() => null);
  const parsed = upsellBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { items_in_cart, customer_phone, subtotal_cents } = parsed.data;
  const itemIds = items_in_cart.map((i) => i.item_id);

  // 4. Cache check
  const key = cacheKey(authed.tenantId, itemIds);
  const hit = getCached(key);
  if (hit) {
    return new NextResponse(hit, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=300',
        'X-Cache': 'HIT',
      },
    });
  }

  // 5. Compute suggestions
  const result = await getUpsellSuggestions({
    tenantId: authed.tenantId,
    itemsInCart: items_in_cart,
    customerPhone: customer_phone,
    subtotalCents: subtotal_cents,
  });

  // 6. Audit (best-effort, fire-and-forget — same pattern as other audit calls)
  void auditSuggestionsReturned(authed.tenantId, result.suggestions.length, result.total_expected_lift_cents);

  // 7. Build response
  const responseBody = JSON.stringify({
    suggestions: result.suggestions,
    total_expected_lift_cents: result.total_expected_lift_cents,
    computed_at: new Date().toISOString(),
    cache_ttl_seconds: 300,
  });

  setCached(key, responseBody);

  return new NextResponse(responseBody, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=300',
      'X-Cache': 'MISS',
    },
  });
}

// ---------------------------------------------------------------------------
// Audit helper — writes directly to audit_log via service-role client,
// matching the pattern in apps/restaurant-web/src/app/api/checkout/order-finalize.ts.
// Best-effort: failures are swallowed so audit never blocks the response.
// ---------------------------------------------------------------------------

async function auditSuggestionsReturned(
  tenantId: string,
  itemsCount: number,
  liftCents: number,
): Promise<void> {
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase-admin');
    const adminAny = getSupabaseAdmin() as unknown as {
      from: (t: string) => {
        insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
    };
    await adminAny.from('audit_log').insert({
      tenant_id: tenantId,
      actor_user_id: null,
      action: 'upsell.suggestions_returned',
      metadata: { items_count: itemsCount, lift_cents: liftCents },
    });
  } catch {
    // Audit failures must never surface to the caller
  }
}
