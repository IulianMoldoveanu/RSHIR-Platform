import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireZoneManager } from '@/lib/api-tenant';
import { assertSameOrigin } from '@/lib/origin-check';

export const dynamic = 'force-dynamic';

const updateTierSchema = z
  .object({
    min_km: z.number().nonnegative().optional(),
    max_km: z.number().positive().optional(),
    price_ron: z.number().nonnegative().optional(),
    sort_order: z.number().int().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin', reason: origin.reason }, { status: 403 });
  }

  const auth = await requireZoneManager();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = updateTierSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
  }

  const updates: { min_km?: number; max_km?: number; price_ron?: number; sort_order?: number } = {};
  if (parsed.data.min_km !== undefined) updates.min_km = parsed.data.min_km;
  if (parsed.data.max_km !== undefined) updates.max_km = parsed.data.max_km;
  if (parsed.data.price_ron !== undefined) updates.price_ron = parsed.data.price_ron;
  if (parsed.data.sort_order !== undefined) updates.sort_order = parsed.data.sort_order;

  // Pre-flight overlap check: derive the resulting (min_km, max_km) after
  // this PATCH from the current row, then ensure it does not overlap any
  // sibling tier. POST already does this for inserts; without this PATCH
  // path, widening a tier's range produced overlapping pricing that the
  // storefront pricing engine consumed ambiguously.
  if (updates.min_km !== undefined || updates.max_km !== undefined) {
    const { data: currentRow, error: currentErr } = await auth.supabase
      .from('delivery_pricing_tiers')
      .select('min_km, max_km')
      .eq('id', params.id)
      .eq('tenant_id', auth.tenantId)
      .maybeSingle();
    if (currentErr) {
      console.error('[tiers] preflight read failed', { tenantId: auth.tenantId, tierId: params.id, code: currentErr.code, message: currentErr.message });
      return NextResponse.json({ error: 'db_error' }, { status: 400 });
    }
    if (!currentRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const cur = currentRow as { min_km: number; max_km: number };
    const nextMin = updates.min_km ?? Number(cur.min_km);
    const nextMax = updates.max_km ?? Number(cur.max_km);
    if (nextMax <= nextMin) {
      return NextResponse.json({ error: 'max_km must be greater than min_km after update' }, { status: 400 });
    }
    const { data: siblings, error: sibErr } = await auth.supabase
      .from('delivery_pricing_tiers')
      .select('min_km, max_km')
      .eq('tenant_id', auth.tenantId)
      .neq('id', params.id);
    if (sibErr) {
      console.error('[tiers] preflight siblings failed', { tenantId: auth.tenantId, tierId: params.id, code: sibErr.code, message: sibErr.message });
      return NextResponse.json({ error: 'db_error' }, { status: 400 });
    }
    const overlaps = (siblings ?? []).some(
      (t: { min_km: number; max_km: number }) =>
        nextMin < Number(t.max_km) && nextMax > Number(t.min_km),
    );
    if (overlaps) {
      return NextResponse.json({ error: 'Tier ranges overlap with an existing tier.' }, { status: 409 });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = auth.supabase as any;
  const { data, error } = await sb
    .from('delivery_pricing_tiers')
    .update(updates)
    .eq('id', params.id)
    .eq('tenant_id', auth.tenantId)
    .select('id, min_km, max_km, price_ron, sort_order')
    .single();

  if (error) {
    console.error('[tiers] update failed', { tenantId: auth.tenantId, tierId: params.id, code: error.code, message: error.message });
    return NextResponse.json({ error: 'db_error' }, { status: 400 });
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const row = data as { id: string; min_km: number; max_km: number; price_ron: number; sort_order: number };
  return NextResponse.json({ tier: row });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin', reason: origin.reason }, { status: 403 });
  }

  const auth = await requireZoneManager();
  if (!auth.ok) return auth.response;

  const { error } = await auth.supabase
    .from('delivery_pricing_tiers')
    .delete()
    .eq('id', params.id)
    .eq('tenant_id', auth.tenantId);

  if (error) {
    console.error('[tiers] delete failed', { tenantId: auth.tenantId, tierId: params.id, code: error.code, message: error.message });
    return NextResponse.json({ error: 'db_error' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
