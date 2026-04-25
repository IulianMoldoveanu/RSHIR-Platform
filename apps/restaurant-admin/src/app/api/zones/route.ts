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

const createZoneSchema = z.object({
  name: z.string().min(1).max(100),
  polygon: polygonSchema,
  is_active: z.boolean().optional().default(true),
});

export async function GET() {
  const auth = await requireTenantAuth();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from('delivery_zones')
    .select('id, name, polygon, is_active, sort_order, created_at')
    .eq('tenant_id', auth.tenantId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ zones: data ?? [] });
}

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin', reason: origin.reason }, { status: 403 });
  }

  const auth = await requireTenantAuth();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = createZoneSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = auth.supabase as any;
  const { data, error } = await sb
    .from('delivery_zones')
    .insert({
      tenant_id: auth.tenantId,
      name: parsed.data.name,
      polygon: parsed.data.polygon as unknown as Json,
      is_active: parsed.data.is_active,
    })
    .select('id, name, polygon, is_active, sort_order, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ zone: data }, { status: 201 });
}
