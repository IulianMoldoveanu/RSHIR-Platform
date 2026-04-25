import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireTenantAuth } from '@/lib/api-tenant';

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
  const auth = await requireTenantAuth();
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = auth.supabase as any;
  const { data, error } = await sb
    .from('delivery_pricing_tiers')
    .update(updates)
    .eq('id', params.id)
    .eq('tenant_id', auth.tenantId)
    .select('id, min_km, max_km, price_ron, sort_order')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const row = data as { id: string; min_km: number; max_km: number; price_ron: number; sort_order: number };
  if (Number(row.max_km) <= Number(row.min_km)) {
    return NextResponse.json({ error: 'max_km must be greater than min_km after update' }, { status: 400 });
  }
  return NextResponse.json({ tier: row });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireTenantAuth();
  if (!auth.ok) return auth.response;

  const { error } = await auth.supabase
    .from('delivery_pricing_tiers')
    .delete()
    .eq('id', params.id)
    .eq('tenant_id', auth.tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
