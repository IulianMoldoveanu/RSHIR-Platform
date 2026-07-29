import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { resolveTenantFromHost } from '@/lib/tenant';
import { assertSameOrigin } from '@/lib/origin-check';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { getUpsellSuggestions } from '@/lib/upsell';
import { getMenuItemsByIds } from '@/lib/menu';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  items: z
    .array(z.object({ itemId: z.string().uuid(), quantity: z.number().int().positive().max(50) }))
    .max(50),
});

export async function POST(req: NextRequest) {
  // Cart-aware, so it's called on every cart change — cap generously above
  // normal browsing cadence while still blocking scripted abuse.
  const rl = checkLimit(`cart-upsell:${clientIp(req)}`, { capacity: 60, refillPerSec: 1 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin', reason: origin.reason }, { status: 403 });
  }

  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request', issues: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.items.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const result = await getUpsellSuggestions({
    tenantId: tenant.id,
    itemsInCart: parsed.data.items.map((i) => ({ item_id: i.itemId, qty: i.quantity })),
  });

  const items = await getMenuItemsByIds(
    tenant.id,
    result.suggestions.map((s) => s.item_id),
  );

  return NextResponse.json({ items });
}
