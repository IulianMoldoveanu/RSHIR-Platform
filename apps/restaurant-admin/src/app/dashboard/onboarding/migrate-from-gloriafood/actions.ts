'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { assertTenantMember, getActiveTenant } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';
import {
  parseGloriaFoodCsvText,
  type ParseResult,
  type ParsedItem,
} from '@/lib/gloriafood/parser';

// GloriaFood CSV parser logic lives in `@/lib/gloriafood/parser` (pure,
// no auth/DB) so it can be unit-tested under vitest. This action wraps
// that parser with auth + tenant scope.

export type { ParsedItem, ParseResult };

export async function parseGloriaFoodCsv(
  expectedTenantId: string,
  csvText: string,
): Promise<ParseResult> {
  // Auth check first.
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Trebuie să fiți autentificat.' };
  const { tenant } = await getActiveTenant();
  if (tenant.id !== expectedTenantId) {
    return { ok: false, error: 'Tenant mismatch.' };
  }
  await assertTenantMember(user.id, tenant.id);

  return parseGloriaFoodCsvText(csvText);
}

const commitSchema = z.object({
  tenantId: z.string().uuid(),
  items: z
    .array(
      z.object({
        category: z.string().min(1).max(120),
        name: z.string().min(1).max(200),
        description: z.string().max(1000),
        price_ron: z.number().min(0).max(9999),
        flagged: z.string().nullable(),
        external_id: z.string().max(120).optional(),
      }),
    )
    .min(1)
    .max(2000),
});

export type CommitResult =
  | {
      ok: true;
      categoriesCreated: number;
      itemsCreated: number;
    }
  | { ok: false; error: string };

export async function commitGloriaFoodImport(
  rawInput: unknown,
): Promise<CommitResult> {
  // Auth + tenant scope.
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Trebuie să fiți autentificat.' };

  const parsed = commitSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: 'Date invalide pentru import.' };
  }
  const { tenantId, items } = parsed.data;

  const { tenant } = await getActiveTenant();
  if (tenant.id !== tenantId) {
    return { ok: false, error: 'Tenant mismatch.' };
  }
  await assertTenantMember(user.id, tenant.id);

  const admin = createAdminClient();

  // Determine the next sort_order baseline so imports append rather than
  // collide with any existing menu rows.
  const { data: maxCat } = await admin
    .from('restaurant_menu_categories')
    .select('sort_order')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const baseCatOrder = (maxCat?.sort_order ?? -1) + 1;

  // Group items by category, preserving first-appearance order.
  const categoryOrder: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (!seen.has(it.category)) {
      seen.add(it.category);
      categoryOrder.push(it.category);
    }
  }

  // Create categories. Idempotent-ish: if a category with the same name
  // already exists for this tenant, reuse its id.
  const { data: existingCats } = await admin
    .from('restaurant_menu_categories')
    .select('id, name')
    .eq('tenant_id', tenantId);

  const existingMap = new Map<string, string>();
  for (const c of existingCats ?? []) {
    existingMap.set(c.name.trim().toLowerCase(), c.id);
  }

  const categoryIdByName = new Map<string, string>();
  let categoriesCreated = 0;

  for (let i = 0; i < categoryOrder.length; i++) {
    const name = categoryOrder[i];
    const key = name.trim().toLowerCase();
    if (existingMap.has(key)) {
      categoryIdByName.set(name, existingMap.get(key)!);
      continue;
    }
    const { data, error } = await admin
      .from('restaurant_menu_categories')
      .insert({
        tenant_id: tenantId,
        name,
        sort_order: baseCatOrder + i,
      })
      .select('id')
      .single();
    if (error || !data) {
      return {
        ok: false,
        error: `Eroare la creare categorie "${name}": ${error?.message ?? 'unknown'}`,
      };
    }
    categoryIdByName.set(name, data.id);
    categoriesCreated += 1;
  }

  // Bulk insert/upsert items per category. When items carry an external_id
  // (Master Key import path), upsert on (tenant_id, external_source, external_id)
  // so re-importing the same key updates rather than duplicates. CSV path has
  // no external_id and falls back to plain insert.
  let itemsCreated = 0;
  for (const cat of categoryOrder) {
    const catId = categoryIdByName.get(cat)!;
    const itemsInCat = items.filter((i) => i.category === cat);

    const withExternal = itemsInCat.filter((i) => i.external_id);
    const withoutExternal = itemsInCat.filter((i) => !i.external_id);

    if (withoutExternal.length > 0) {
      const rows = withoutExternal.map((it, idx) => ({
        tenant_id: tenantId,
        category_id: catId,
        name: it.name,
        description: it.description || null,
        price_ron: it.price_ron,
        is_available: it.flagged ? false : true,
        sort_order: idx,
        tags: [] as string[],
      }));
      const { error } = await admin.from('restaurant_menu_items').insert(rows);
      if (error) {
        return {
          ok: false,
          error: `Eroare la inserare produse în "${cat}": ${error.message}`,
        };
      }
      itemsCreated += rows.length;
    }

    if (withExternal.length > 0) {
      const offset = withoutExternal.length;
      const rows = withExternal.map((it, idx) => ({
        tenant_id: tenantId,
        category_id: catId,
        name: it.name,
        description: it.description || null,
        price_ron: it.price_ron,
        is_available: it.flagged ? false : true,
        sort_order: offset + idx,
        tags: [] as string[],
        external_source: 'gloriafood',
        external_id: it.external_id!,
      }));
      // upsert needs casting through unknown — supabase types not regenerated yet
      // for the new external_source/external_id columns added in 20260505_002.
      const sb = admin as unknown as {
        from: (t: string) => {
          upsert: (
            rows: Record<string, unknown>[],
            opts: { onConflict: string },
          ) => Promise<{ error: { message: string } | null }>;
        };
      };
      const { error } = await sb
        .from('restaurant_menu_items')
        .upsert(rows, { onConflict: 'tenant_id,external_source,external_id' });
      if (error) {
        return {
          ok: false,
          error: `Eroare la upsert produse în "${cat}": ${error.message}`,
        };
      }
      itemsCreated += rows.length;
    }
  }

  await logAudit({
    tenantId,
    actorUserId: user.id,
    action: 'menu.gloriafood_import',
    entityType: 'menu',
    entityId: tenantId,
    metadata: {
      categories_created: categoriesCreated,
      items_created: itemsCreated,
      flagged_count: items.filter((i) => i.flagged).length,
    },
  });

  revalidatePath('/dashboard/menu');
  return { ok: true, categoriesCreated, itemsCreated };
}

// ────────────────────────────────────────────────────────────
// parseGloriaFoodMasterKey — fetches menu via Master Key API and returns
// the same ParseResult shape as parseGloriaFoodCsv. The user then proceeds
// with the existing commitGloriaFoodImport flow (no API rewrite needed).
//
// API: https://www.beta.gloriafood.com/v2/master/<MASTER_KEY>/menus
// We don't store the raw key — the operator pastes it again on commit if
// they want to re-fetch.
// ────────────────────────────────────────────────────────────

const GLORIAFOOD_MASTER_BASE = 'https://www.beta.gloriafood.com/v2/master';

type GfCategory = { id?: number | string; name?: string };
type GfItem = {
  id?: number | string;
  name?: string;
  description?: string;
  price?: number | string;
  category_id?: number | string;
};

export async function parseGloriaFoodMasterKey(
  expectedTenantId: string,
  masterKey: string,
): Promise<ParseResult> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Trebuie să fiți autentificat.' };
  const { tenant } = await getActiveTenant();
  if (tenant.id !== expectedTenantId) return { ok: false, error: 'Tenant mismatch.' };
  await assertTenantMember(user.id, tenant.id);

  if (!masterKey || masterKey.trim().length < 20 || masterKey.length > 200) {
    return { ok: false, error: 'Master Key invalid (lungime suspectă).' };
  }

  let gfData: unknown;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    const r = await fetch(
      `${GLORIAFOOD_MASTER_BASE}/${encodeURIComponent(masterKey.trim())}/menus`,
      {
        headers: { 'User-Agent': 'HIR-importer/1.0', Accept: 'application/json' },
        signal: ctrl.signal,
      },
    );
    clearTimeout(timer);
    if (r.status === 401 || r.status === 403) {
      return {
        ok: false,
        error: 'GloriaFood respinge cheia. Verifică în GloriaFood Admin → Master Key.',
      };
    }
    if (r.status === 404) {
      return { ok: false, error: 'Cheia există dar contul nu are meniu activ.' };
    }
    if (!r.ok) {
      return { ok: false, error: `GloriaFood API a returnat ${r.status}.` };
    }
    gfData = await r.json();
  } catch (e) {
    return {
      ok: false,
      error:
        'Nu am putut contacta GloriaFood: ' +
        (e instanceof Error ? e.message.substring(0, 200) : 'eroare necunoscută'),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const root: any = gfData;
  const menus: Array<{ categories?: GfCategory[]; items?: GfItem[] }> = Array.isArray(root)
    ? root
    : Array.isArray(root?.menus)
      ? root.menus
      : [{ categories: root?.categories ?? [], items: root?.items ?? [] }];

  const gfCatById = new Map<string, string>(); // gfCatId -> name
  const gfItems: GfItem[] = [];
  for (const m of menus) {
    for (const c of m.categories ?? []) {
      const id = String(c.id ?? c.name ?? '');
      const name = (c.name ?? 'Categorie').toString().trim() || 'Necategorisit';
      if (id) gfCatById.set(id, name);
    }
    for (const it of m.items ?? []) gfItems.push(it);
  }

  const items: ParsedItem[] = [];
  for (const it of gfItems) {
    const name = (it.name ?? '').toString().trim().slice(0, 200);
    if (!name) continue;
    const priceRaw = typeof it.price === 'number' ? it.price : Number(it.price ?? 0);
    const price = Number.isFinite(priceRaw) && priceRaw >= 0 ? Math.round(priceRaw * 100) / 100 : 0;
    let flagged: string | null = null;
    if (price === 0) flagged = 'Preț 0 — verifică manual';
    if (name.length === 200) flagged = 'Numele atinge limita 200 caractere';

    const catName = gfCatById.get(String(it.category_id ?? '')) ?? 'Necategorisit';
    const externalId = it.id !== undefined && it.id !== null ? String(it.id) : undefined;
    items.push({
      category: catName,
      name,
      description: (it.description ?? '').toString().trim().slice(0, 1000),
      price_ron: price,
      flagged,
      external_id: externalId,
    });
  }

  if (items.length === 0) {
    return { ok: false, error: 'GloriaFood a răspuns dar fără produse importabile.' };
  }

  const categoryCount = new Set(items.map((i) => i.category)).size;
  return { ok: true, itemCount: items.length, categoryCount, items, warnings: [] };
}

