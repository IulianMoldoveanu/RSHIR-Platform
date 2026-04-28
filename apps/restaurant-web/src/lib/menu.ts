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

export type MenuModifier = {
  id: string;
  name: string;
  price_delta_ron: number;
  /** Sort order within a group, or among ungrouped modifiers. */
  sort_order?: number;
};

/**
 * A group of modifier options for a single menu item — e.g. "Mărime"
 * (required, choose 1) or "Toppings" (optional, max 5). Modifiers
 * with no group_id render as the legacy ungrouped optional list.
 */
export type MenuModifierGroup = {
  id: string;
  name: string;
  isRequired: boolean;
  selectMin: number;
  selectMax: number | null;
  sortOrder: number;
  options: MenuModifier[];
};

export type MenuItemWithModifiers = MenuItem & {
  /** Ungrouped optional modifiers (legacy pattern, group_id IS NULL). */
  modifiers: MenuModifier[];
  /** Grouped modifier sets with required / min / max constraints. */
  modifierGroups: MenuModifierGroup[];
};

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

  // ungrouped modifiers per item (legacy: group_id IS NULL)
  const ungroupedByItem = new Map<string, MenuModifier[]>();
  // groups + their option lists per item
  const groupsByItem = new Map<string, MenuModifierGroup[]>();

  if (items.length > 0) {
    const itemIds = items.map((i) => i.id);

    // Pull ALL modifier rows for these items (grouped + ungrouped).
    // Cast through any until supabase-types regenerates with group_id +
    // sort_order from 20260505_001. If the migration hasn't shipped yet,
    // PostgREST returns an error; we catch and fall back to the legacy
    // SELECT so the menu keeps loading without groups.
    let modRows: Array<{
      id: string;
      item_id: string;
      name: string;
      price_delta_ron: number;
      group_id: string | null;
      sort_order: number;
    }> = [];
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await (supabase
        .from('restaurant_menu_modifiers')
        .select('id, item_id, name, price_delta_ron, group_id, sort_order') as any)
        .in('item_id', itemIds);
      if (r.error && /group_id|sort_order/i.test(r.error.message ?? '')) {
        const legacy = await supabase
          .from('restaurant_menu_modifiers')
          .select('id, item_id, name, price_delta_ron')
          .in('item_id', itemIds);
        const legacyRows = (legacy.data ?? []) as Array<{
          id: string;
          item_id: string;
          name: string;
          price_delta_ron: number;
        }>;
        modRows = legacyRows.map((m) => ({
          id: m.id,
          item_id: m.item_id,
          name: m.name,
          price_delta_ron: m.price_delta_ron,
          group_id: null,
          sort_order: 0,
        }));
      } else if (!r.error && Array.isArray(r.data)) {
        modRows = r.data as typeof modRows;
      }
    }

    // Pull groups; defensive on the table existing (pre-migration the
    // PostgREST schema cache may not know about it — same fallback).
    let groupRows: Array<{
      id: string;
      item_id: string;
      name: string;
      is_required: boolean;
      select_min: number;
      select_max: number | null;
      sort_order: number;
    }> = [];
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = await ((supabase as any)
        .from('restaurant_menu_modifier_groups')
        .select('id, item_id, name, is_required, select_min, select_max, sort_order'))
        .in('item_id', itemIds);
      if (!g.error && Array.isArray(g.data)) groupRows = g.data;
    } catch {
      groupRows = [];
    }

    // Index modifiers by group_id so we can attach them to their groups.
    const modsByGroup = new Map<string, MenuModifier[]>();
    for (const m of modRows) {
      const opt: MenuModifier = {
        id: m.id,
        name: m.name,
        price_delta_ron: Number(m.price_delta_ron),
        sort_order: m.sort_order,
      };
      if (m.group_id === null) {
        const arr = ungroupedByItem.get(m.item_id) ?? [];
        arr.push(opt);
        ungroupedByItem.set(m.item_id, arr);
      } else {
        const arr = modsByGroup.get(m.group_id) ?? [];
        arr.push(opt);
        modsByGroup.set(m.group_id, arr);
      }
    }

    // Sort everything by sort_order so the renderer doesn't have to.
    for (const arr of ungroupedByItem.values()) {
      arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }
    for (const arr of modsByGroup.values()) {
      arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }

    // Build groups attached to their item.
    for (const g of groupRows.sort((a, b) => a.sort_order - b.sort_order)) {
      const group: MenuModifierGroup = {
        id: g.id,
        name: g.name,
        isRequired: g.is_required,
        selectMin: g.select_min,
        selectMax: g.select_max,
        sortOrder: g.sort_order,
        options: modsByGroup.get(g.id) ?? [],
      };
      const arr = groupsByItem.get(g.item_id) ?? [];
      arr.push(group);
      groupsByItem.set(g.item_id, arr);
    }
  }

  const itemsByCat = new Map<string, MenuItemWithModifiers[]>();
  items.forEach((it) => {
    const arr = itemsByCat.get(it.category_id) ?? [];
    arr.push({
      ...it,
      modifiers: ungroupedByItem.get(it.id) ?? [],
      modifierGroups: groupsByItem.get(it.id) ?? [],
    });
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
 * Returns the tenant's top-N most-ordered items over the last 30 days, with
 * modifiers attached. Used by the cart drawer to render an "Also order"
 * upsell rail (Wolt / Glovo / DoorDash 'Complement your Cart' pattern).
 *
 * Falls back (S3) to the first N available items by sort_order when the
 * tenant has no qualifying order history yet — guarantees the rail shows
 * up for newly-launched tenants instead of being silently empty.
 */
export async function getTopPopularItems(
  tenantId: string,
  limit = 5,
): Promise<MenuItemWithModifiers[]> {
  const supabase = getSupabase();
  const ranks = await loadPopularRanks(tenantId);

  if (ranks.size === 0) {
    const fallback = await getTopItems(tenantId, limit);
    if (fallback.length === 0) return [];
    const ids = fallback.map((it) => it.id);
    const modsRes = await supabase
      .from('restaurant_menu_modifiers')
      .select('id, item_id, name, price_delta_ron')
      .in('item_id', ids);
    const modsByItem = new Map<string, MenuModifier[]>();
    for (const m of (modsRes.data ?? []) as Array<MenuModifier & { item_id: string }>) {
      const arr = modsByItem.get(m.item_id) ?? [];
      arr.push({ id: m.id, name: m.name, price_delta_ron: m.price_delta_ron });
      modsByItem.set(m.item_id, arr);
    }
    return fallback.map((it) => ({
      ...it,
      modifiers: modsByItem.get(it.id) ?? [],
      modifierGroups: [] as MenuModifierGroup[],
    }));
  }

  const ids = Array.from(ranks.keys());
  const [itemsRes, modsRes] = await Promise.all([
    supabase.from('restaurant_menu_items').select(ITEM_COLS).eq('tenant_id', tenantId).in('id', ids),
    supabase.from('restaurant_menu_modifiers').select('id, item_id, name, price_delta_ron').in('item_id', ids),
  ]);

  const rawItems = (itemsRes.data ?? []) as Array<
    Omit<MenuItem, 'popular_rank'> & { sold_out_until: string | null }
  >;
  const modsByItem = new Map<string, MenuModifier[]>();
  for (const m of (modsRes.data ?? []) as Array<MenuModifier & { item_id: string }>) {
    const arr = modsByItem.get(m.item_id) ?? [];
    arr.push({ id: m.id, name: m.name, price_delta_ron: m.price_delta_ron });
    modsByItem.set(m.item_id, arr);
  }

  return rawItems
    .map(({ sold_out_until, ...rest }) => ({
      ...rest,
      is_available: isEffectivelyAvailable({ is_available: rest.is_available, sold_out_until }),
      popular_rank: ranks.get(rest.id) ?? null,
      modifiers: modsByItem.get(rest.id) ?? [],
      // The cart-upsell rail opens the standard ItemSheet which knows how
      // to fetch group state on its own. For now we ship empty groups; if
      // an item with required groups appears here, the sheet will fetch
      // and render them when opened (or the user gets the legacy flow).
      modifierGroups: [] as MenuModifierGroup[],
    }))
    .filter((it) => it.is_available)
    .sort((a, b) => (a.popular_rank ?? 99) - (b.popular_rank ?? 99))
    .slice(0, limit);
}

/**
 * Returns up to N items from the customer's most recent orders at this tenant
 * — newest first, deduped, restricted to items still on the live menu.
 * Used by the storefront home to render a "Comandă din nou" rail for
 * returning customers (cookie-recognized, not auth).
 */
export async function getRecentlyOrderedItems(
  tenantId: string,
  customerId: string,
  menu: MenuCategory[],
  limit = 5,
): Promise<MenuItemWithModifiers[]> {
  const supabase = getSupabase();
  const { data: orders } = await supabase
    .from('restaurant_orders')
    .select('items, created_at')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .neq('status', 'CANCELLED')
    .order('created_at', { ascending: false })
    .limit(10);

  const liveById = new Map<string, MenuItemWithModifiers>();
  for (const c of menu) {
    for (const it of c.items) {
      if (it.is_available) liveById.set(it.id, it);
    }
  }

  const seen = new Set<string>();
  const out: MenuItemWithModifiers[] = [];
  const rows = (orders ?? []) as Array<{ items: unknown }>;
  for (const o of rows) {
    const items = Array.isArray(o.items) ? (o.items as Array<{ itemId?: string }>) : [];
    for (const li of items) {
      if (!li || typeof li.itemId !== 'string' || seen.has(li.itemId)) continue;
      const live = liveById.get(li.itemId);
      if (!live) continue;
      seen.add(li.itemId);
      out.push(live);
      if (out.length >= limit) return out;
    }
  }
  return out;
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

  return { ...item, modifiers, modifierGroups: [] as MenuModifierGroup[] };
}
