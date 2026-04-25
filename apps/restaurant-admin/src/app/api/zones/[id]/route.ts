import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { Json } from '@hir/supabase-types';
import { requireTenantAuth } from '@/lib/api-tenant';
import { assertSameOrigin } from '@/lib/origin-check';

export const dynamic = 'force-dynamic';

const polygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z
    .array(z.array(z.tuple([z.number(), z.number()])).min(4))
    .min(1),
});

const updateZoneSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    polygon: polygonSchema.optional(),
    is_active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin', reason: origin.reason }, { status: 403 });
  }

  const auth = await requireTenantAuth();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = updateZoneSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
  }

  const updates: { name?: string; is_active?: boolean; polygon?: Json } = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.is_active !== undefined) updates.is_active = parsed.data.is_active;
  if (parsed.data.polygon !== undefined) updates.polygon = parsed.data.polygon as unknown as Json;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = auth.supabase as any;
  const { data, error } = await sb
    .from('delivery_zones')
    .update(updates)
    .eq('id', params.id)
    .eq('tenant_id', auth.tenantId)
    .select('id, name, polygon, is_active, sort_order, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ zone: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin', reason: origin.reason }, { status: 403 });
  }

  const auth = await requireTenantAuth();
  if (!auth.ok) return auth.response;

  const { error } = await auth.supabase
    .from('delivery_zones')
    .delete()
    .eq('id', params.id)
    .eq('tenant_id', auth.tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
