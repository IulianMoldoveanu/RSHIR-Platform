import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireTenantAuth } from '@/lib/api-tenant';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertSameOrigin } from '@/lib/origin-check';

export const dynamic = 'force-dynamic';

const commitRowSchema = z.object({
  category: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().default(''),
  price_ron: z.coerce.number().nonnegative().max(100000),
});

const commitSchema = z.object({
  rows: z.array(commitRowSchema).min(1).max(500),
});

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin', reason: origin.reason }, { status: 403 });
  }

  const auth = await requireTenantAuth();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = commitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Payload invalid', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const tenantId = auth.tenantId;

  const { data: cats, error: catErr } = await admin
    .from('restaurant_menu_categories')
    .select('id, name, sort_order')
    .eq('tenant_id', tenantId);
  if (catErr) {
    return NextResponse.json({ error: catErr.message }, { status: 500 });
  }

  const byName = new Map<string, string>();
  let maxOrder = -1;
  for (const c of cats ?? []) {
    byName.set(c.name.toLowerCase(), c.id);
    if (c.sort_order > maxOrder) maxOrder = c.sort_order;
  }

  let categoriesCreated = 0;
  for (const row of parsed.data.rows) {
    const key = row.category.toLowerCase();
    if (!byName.has(key)) {
      maxOrder += 1;
      const { data: created, error } = await admin
        .from('restaurant_menu_categories')
        .insert({ tenant_id: tenantId, name: row.category, sort_order: maxOrder })
        .select('id')
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      byName.set(key, created.id);
      categoriesCreated += 1;
    }
  }

  const inserts = parsed.data.rows.map((row) => ({
    tenant_id: tenantId,
    category_id: byName.get(row.category.toLowerCase())!,
    name: row.name,
    description: row.description || null,
    price_ron: row.price_ron,
    is_available: true,
    tags: [] as string[],
  }));

  const { error: insErr, count } = await admin
    .from('restaurant_menu_items')
    .insert(inserts, { count: 'exact' });
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({
    created: count ?? inserts.length,
    categoriesCreated,
    skipped: parsed.data.rows.length - (count ?? inserts.length),
  });
}
