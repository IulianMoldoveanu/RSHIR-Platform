'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { assertTenantMember, getActiveTenant } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';

// GloriaFood's "Export menu" feature produces a CSV with rows representing
// every menu line item. The exact columns differ slightly between exports,
// but the canonical set is:
//   Category, Item, Description, Price, Image URL, Variant, Variant Price
//
// We accept either lowercase or capitalized headers, with or without
// underscores. We also accept Romanian header variants ("Categorie",
// "Produs", "Descriere", "Pret") since some operators relabel before export.

type Headers = Record<string, number>;

const HEADER_ALIASES: Record<string, string[]> = {
  category: ['category', 'category_name', 'categorie', 'cat'],
  name: ['item', 'item_name', 'name', 'product', 'produs', 'nume'],
  description: ['description', 'descriere', 'desc'],
  price: ['price', 'pret', 'pret_ron', 'price_ron'],
  image_url: ['image', 'image_url', 'imagine'],
};

function normalize(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '');
}

function detectHeaders(headerRow: string[]): Headers {
  const map: Headers = {};
  headerRow.forEach((raw, idx) => {
    const norm = normalize(raw);
    for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(norm) && map[canonical] === undefined) {
        map[canonical] = idx;
      }
    }
  });
  return map;
}

// Tiny RFC-4180-ish CSV parser. Avoids pulling a dependency for one use site.
// Handles quoted fields, embedded commas, escaped quotes ("").
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',' || ch === ';') {
      cur.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = '';
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

function parsePrice(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .replace(/\s/g, '')
    .replace(/RON|LEI|lei|ron/g, '')
    .replace(',', '.');
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export type ParsedItem = {
  category: string;
  name: string;
  description: string;
  price_ron: number;
  flagged: string | null; // null = clean; string = warning reason
};

export type ParseResult =
  | {
      ok: true;
      itemCount: number;
      categoryCount: number;
      items: ParsedItem[];
    }
  | { ok: false; error: string };

export async function parseGloriaFoodCsv(
  expectedTenantId: string,
  csvText: string,
): Promise<ParseResult> {
  // Auth check first.
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Trebuie să fiți autentificat.' };
  const { tenant } = await getActiveTenant();
  if (tenant.id !== expectedTenantId) {
    return { ok: false, error: 'Tenant mismatch.' };
  }
  await assertTenantMember(user.id, tenant.id);

  if (!csvText || csvText.trim().length === 0) {
    return { ok: false, error: 'CSV gol.' };
  }
  if (csvText.length > 5 * 1024 * 1024) {
    return { ok: false, error: 'CSV depășește 5 MB.' };
  }

  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return { ok: false, error: 'CSV trebuie să aibă header + cel puțin un rând.' };
  }

  const headers = detectHeaders(rows[0]);
  if (headers.name === undefined || headers.price === undefined) {
    return {
      ok: false,
      error:
        'CSV-ul trebuie să conțină cel puțin coloanele "Item Name" și "Price". Verifică că ai exportat din GloriaFood folosind opțiunea "Export menu".',
    };
  }

  const items: ParsedItem[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = (row[headers.name] ?? '').trim();
    const priceRaw = row[headers.price];
    const price = parsePrice(priceRaw);

    if (name.length === 0) continue; // skip blank rows
    let flagged: string | null = null;
    if (price === null) flagged = 'Preț neidentificabil — verifică manual';
    if (name.length > 200) flagged = 'Numele depășește 200 caractere';

    items.push({
      category:
        headers.category !== undefined
          ? (row[headers.category] ?? 'Necategorisit').trim() || 'Necategorisit'
          : 'Necategorisit',
      name: name.slice(0, 200),
      description:
        headers.description !== undefined
          ? (row[headers.description] ?? '').trim().slice(0, 1000)
          : '',
      price_ron: price ?? 0,
      flagged,
    });
  }

  if (items.length === 0) {
    return { ok: false, error: 'Niciun produs valid găsit în CSV.' };
  }

  const categoryCount = new Set(items.map((i) => i.category)).size;
  return { ok: true, itemCount: items.length, categoryCount, items };
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
  const supabase = createServerClient();
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

  // Bulk insert items per category.
  let itemsCreated = 0;
  for (const cat of categoryOrder) {
    const catId = categoryIdByName.get(cat)!;
    const itemsInCat = items.filter((i) => i.category === cat);

    const rows = itemsInCat.map((it, idx) => ({
      tenant_id: tenantId,
      category_id: catId,
      name: it.name,
      description: it.description || null,
      price_ron: it.price_ron,
      is_available: it.flagged ? false : true, // flagged items shipped offline
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
