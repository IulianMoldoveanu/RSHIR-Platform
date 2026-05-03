import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireTenantAuth } from '@/lib/api-tenant';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertSameOrigin } from '@/lib/origin-check';
import { logAudit } from '@/lib/audit';

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

  // Track which categories WE create vs reuse, so the revert path knows
  // which ones to clean up (leaving pre-existing categories untouched).
  const createdCategoryIds: string[] = [];

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
      createdCategoryIds.push(created.id);
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

  // RSHIR-AI-orchestrator: capture the IDs of items we just created. The
  // revert path on /dashboard/ai-activity uses these to delete only the
  // rows this run produced (not pre-existing items in the same category).
  const { data: insertedRows, error: insErr } = await admin
    .from('restaurant_menu_items')
    .insert(inserts)
    .select('id');
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  const createdItemIds = (insertedRows ?? []).map((r) => r.id as string);
  const created = createdItemIds.length;

  // Log the bulk_import as a copilot_agent_runs entry so it shows in
  // /dashboard/ai-activity and is revertable for 24h. Best-effort —
  // failure here doesn't roll back the import (better to have an
  // unlogged-but-completed import than to crash on the success path).
  try {
    // copilot_agent_runs is not in generated types — same any-cast as
    // the rest of the AI surface. The status defaults to EXECUTED via
    // the DB column default; we set it explicitly for clarity.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = admin as any;
    await sb.from('copilot_agent_runs').insert({
      restaurant_id: tenantId,
      agent_name: 'menu',
      action_type: 'menu.bulk_import',
      status: 'EXECUTED',
      summary: `Import meniu: ${created} produse, ${categoriesCreated} categorii noi`,
      payload: {
        created_item_ids: createdItemIds,
        created_category_ids: createdCategoryIds,
        source: 'menu_import_ui',
        items_count: created,
      },
      // The bot-repo schema also expects metadata for legacy compat;
      // duplicate the summary there so older readers still work.
      metadata: {
        summary: `Import meniu: ${created} produse, ${categoriesCreated} categorii noi`,
        kind: 'menu_bulk_import',
      },
      approved_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[menu-import/commit] copilot_agent_runs log failed', (err as Error).message);
  }

  await logAudit({
    tenantId,
    actorUserId: auth.userId ?? null,
    action: 'ai_ceo.menu_agent_executed',
    entityType: 'menu_import',
    metadata: {
      items_created: created,
      categories_created: categoriesCreated,
    },
  });

  return NextResponse.json({
    created,
    categoriesCreated,
    skipped: parsed.data.rows.length - created,
  });
}
