import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireTenantAuth, requireZoneManager } from '@/lib/api-tenant';
import { assertSameOrigin } from '@/lib/origin-check';

export const dynamic = 'force-dynamic';

const tierSchema = z
  .object({
    min_km: z.number().nonnegative(),
    max_km: z.number().positive(),
    price_ron: z.number().nonnegative(),
    sort_order: z.number().int().optional(),
  })
  .refine((v) => v.max_km > v.min_km, {
    message: 'max_km must be greater than min_km',
    path: ['max_km'],
  });

export async function GET() {
  const auth = await requireTenantAuth();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from('delivery_pricing_tiers')
    .select('id, min_km, max_km, price_ron, sort_order')
    .eq('tenant_id', auth.tenantId)
    .order('min_km', { ascending: true });

  if (error) {
    console.error('[tiers] list failed', { tenantId: auth.tenantId, code: error.code, message: error.message });
    return NextResponse.json({ error: 'db_error' }, { status: 400 });
  }
  return NextResponse.json({ tiers: data ?? [] });
}

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin', reason: origin.reason }, { status: 403 });
  }

  const auth = await requireZoneManager();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = tierSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
  }

  // Reject overlap with existing tiers (defense in depth; UI also validates).
  const { data: existing, error: listErr } = await auth.supabase
    .from('delivery_pricing_tiers')
    .select('min_km, max_km')
    .eq('tenant_id', auth.tenantId);
  if (listErr) {
    console.error('[tiers] overlap-check list failed', { tenantId: auth.tenantId, code: listErr.code, message: listErr.message });
    return NextResponse.json({ error: 'db_error' }, { status: 400 });
  }

  const overlaps = (existing ?? []).some(
    (t: { min_km: number; max_km: number }) =>
      parsed.data.min_km < t.max_km && parsed.data.max_km > t.min_km,
  );
  if (overlaps) {
    return NextResponse.json({ error: 'Tier ranges overlap with an existing tier.' }, { status: 409 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = auth.supabase as any;
  const { data, error } = await sb
    .from('delivery_pricing_tiers')
    .insert({
      tenant_id: auth.tenantId,
      min_km: parsed.data.min_km,
      max_km: parsed.data.max_km,
      price_ron: parsed.data.price_ron,
      sort_order: parsed.data.sort_order ?? 0,
    })
    .select('id, min_km, max_km, price_ron, sort_order')
    .single();

  if (error) {
    console.error('[tiers] insert failed', { tenantId: auth.tenantId, code: error.code, message: error.message });
    return NextResponse.json({ error: 'db_error' }, { status: 400 });
  }
  return NextResponse.json({ tier: data }, { status: 201 });
}
