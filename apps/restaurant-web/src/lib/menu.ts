import { getSupabase } from './supabase';

export type MenuItem = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_ron: number;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
  tags: string[];
  // 1 = #1 most-ordered last 30 days (tenant-wide), 2 / 3 = #2 / #3, null
  // = not in the top-3. Renders as a "Cel mai comandat" / "Top vânzări"
  // badge on the menu card. Computed in getMenuByTenant from order history.
  popular_rank: 1 | 2 | 3 | null;
};

export type MenuModifier = { id: string; name: string; price_delta_ron: number };

export type MenuItemWithModifiers = MenuItem & { modifiers: MenuModifier[] };

export type MenuCategory = {
  id: string;
  name: string;
  sort_order: number;
  items: MenuItemWithModifiers[];
};

const ITEM_COLS =
  'id, category_id, name, description, price_ron, image_url, is_available, sold_out_until, sort_order, tags';

/**
 * Effective availability: persistent toggle AND not currently sold-out today.
 * `sold_out_until` is set by the admin via the "Sold out today" button to
 * the end of the current business day (RSHIR-49) and auto-clears once that
 * time passes.
 */
function isEffectivelyAvailable(it: { is_available: boolean; sold_out_until: string | null }): boolean {
  if (!it.is_available) return false;
  if (!it.sold_out_until) return true;
  return new Date(it.sold_out_until).getTime() <= Date.now();
}

const POPULAR_WINDOW_DAYS = 30;
const POPULAR_TOP_N = 3;
const POPULAR_MIN_QTY = 5; // an item needs ≥5 sold to qualify — avoids ranking
                           // brand-new items #1 just because nothing else has
                           // sold yet.

/**
 * Returns a Map<itemId, rank> for the top-N most-ordered items at this tenant
 * over the last POPULAR_WINDOW_DAYS, drawing from restaurant_orders.items
 * JSONB. Excludes CANCELLED orders. Map is empty if nothing qualifies.
 */
async function loadPopularRanks(tenantId: string): Promise<Map<string, 1 | 2 | 3>> {
  const supabase = getSupabase();
  const sinceIso = new Date(
    Date.now() - POPULAR_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: orders } = await supabase
    .from('restaurant_orders')
    .select('items')
    .eq('tenant_id', tenantId)
    .neq('status', 'CANCELLED')
    .gte('created_at', sinceIso)
    .limit(2000);

  const tally = new Map<string, number>();
  const rows = (orders ?? []) as Array<{ items: unknown }>;
  for (const o of rows) {
    const items = Array.isArray(o.items) ? (o.items as Array<{ itemId?: string; quantity?: number }>) : [];
    for (const li of items) {
      if (!li || typeof li.itemId !== 'string') continue;
      const qty = typeof li.quantity === 'number' && li.quantity > 0 ? li.quantity : 1;
      tally.set(li.itemId, (tally.get(li.itemId) ?? 0) + qty);
    }
  }

  const ranked = Array.from(tally.entries())
    .filter(([, q]) => q >= POPULAR_MIN_QTY)
    .sort((a, b) => b[1] - a[1])
    .slice(0, POPULAR_TOP_N);

  const out = new Map<string, 1 | 2 | 3>();
  ranked.forEach(([id], i) => {
    out.set(id, (i + 1) as 1 | 2 | 3);
  });
  return out;
}

export async function getMenuByTenant(tenantId: string): Promise<MenuCategory[]> {
  const supabase = getSupabase();

  const [catsRes, itemsRes, popularRanks] = await Promise.all([
    supabase
      .from('restaurant_menu_categories')
      .select('id, name, sort_order')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('restaurant_menu_items')
      .select(ITEM_COLS)
      .eq('tenant_id', tenantId)
      .order('sort_order'),
    loadPopularRanks(tenantId),
  ]);

  const cats = (catsRes.data ?? []) as Array<{ id: string; name: string; sort_order: number }>;
  const rawItems = (itemsRes.data ?? []) as Array<
    Omit<MenuItem, 'popular_rank'> & { sold_out_until: string | null }
  >;
  const items: MenuItem[] = rawItems.map(({ sold_out_until, ...rest }) => ({
    ...rest,
    is_available: isEffectivelyAvailable({ is_available: rest.is_available, sold_out_until }),
    popular_rank: popularRanks.get(rest.id) ?? null,
  }));

  if (cats.length === 0) return [];

  let modsByItem = new Map<string, MenuModifier[]>();
  if (items.length > 0) {
    const itemIds = items.map((i) => i.id);
    const modsRes = await supabase
      .from('restaurant_menu_modifiers')
      .select('id, item_id, name, price_delta_ron')
      .in('item_id', itemIds);
    const mods = (modsRes.data ?? []) as Array<MenuModifier & { item_id: string }>;
    mods.forEach((m) => {
      const arr = modsByItem.get(m.item_id) ?? [];
      arr.push({ id: m.id, name: m.name, price_delta_ron: m.price_delta_ron });
      modsByItem.set(m.item_id, arr);
    });
  }

  const itemsByCat = new Map<string, MenuItemWithModifiers[]>();
  items.forEach((it) => {
    const arr = itemsByCat.get(it.category_id) ?? [];
    arr.push({ ...it, modifiers: modsByItem.get(it.id) ?? [] });
    itemsByCat.set(it.category_id, arr);
  });

  return cats.map((c) => ({
    id: c.id,
    name: c.name,
    sort_order: c.sort_order,
    items: itemsByCat.get(c.id) ?? [],
  }));
}

export async function getTopItems(tenantId: string, limit = 8): Promise<MenuItem[]> {
  const supabase = getSupabase();
  const nowIso = new Date().toISOString();
  const res = await supabase
    .from('restaurant_menu_items')
    .select(ITEM_COLS)
    .eq('tenant_id', tenantId)
    .eq('is_available', true)
    .or(`sold_out_until.is.null,sold_out_until.lte.${nowIso}`)
    .order('sort_order')
    .limit(limit);
  const rows = (res.data ?? []) as Array<
    Omit<MenuItem, 'popular_rank'> & { sold_out_until: string | null }
  >;
  return rows.map(({ sold_out_until: _so, ...rest }) => ({ ...rest, popular_rank: null }));
}

/**
 * Look up an item by short-id prefix (first 8 hex chars of UUID, no dashes).
 * Tenant-scoped. Returns null on no/multiple matches.
 */
export async function getItemByShortId(
  tenantId: string,
  shortId: string,
): Promise<MenuItemWithModifiers | null> {
  const supabase = getSupabase();
  const res = await supabase
    .from('restaurant_menu_items')
    .select(ITEM_COLS)
    .eq('tenant_id', tenantId);
  const items = (res.data ?? []) as Array<
    Omit<MenuItem, 'popular_rank'> & { sold_out_until: string | null }
  >;

  const matches = items.filter(
    (it) => it.id.replace(/-/g, '').slice(0, 8).toLowerCase() === shortId.toLowerCase(),
  );
  if (matches.length !== 1) return null;
  const { sold_out_until, ...rest } = matches[0];
  const item: MenuItem = {
    ...rest,
    is_available: isEffectivelyAvailable({ is_available: rest.is_available, sold_out_until }),
    popular_rank: null,
  };

  const modsRes = await supabase
    .from('restaurant_menu_modifiers')
    .select('id, name, price_delta_ron')
    .eq('item_id', item.id);
  const modifiers = (modsRes.data ?? []) as MenuModifier[];

  return { ...item, modifiers };
}
