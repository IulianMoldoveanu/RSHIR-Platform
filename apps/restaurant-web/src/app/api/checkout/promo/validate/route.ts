import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { assertSameOrigin } from '@/lib/origin-check';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { lookupAndValidatePromo } from '../../promo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  code: z.string().trim().min(1).max(64),
  subtotalRon: z.number().nonnegative().max(100000),
  deliveryFeeRon: z.number().nonnegative().max(10000).optional(),
});

export async function POST(req: NextRequest) {
  // Same-origin + per-IP limit (10/min) — keeps the endpoint from being
  // used to enumerate codes by scripted callers.
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json(
      { error: 'forbidden_origin', reason: origin.reason },
      { status: 403 },
    );
  }
  const rl = checkLimit(`promo-validate:${clientIp(req)}`, {
    capacity: 10,
    refillPerSec: 10 / 60,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const result = await lookupAndValidatePromo(
    getSupabaseAdmin(),
    tenant.id,
    parsed.data.code,
    parsed.data.subtotalRon,
    parsed.data.deliveryFeeRon ?? 0,
  );

  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason });
  }

  return NextResponse.json({
    ok: true,
    code: result.promo.code,
    kind: result.promo.kind,
    value_int: result.promo.value_int,
    discountRon: result.discountRon,
  });
}
