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
  'id, category_id, name, description, price_ron, image_url, is_available, sort_order, tags';

export async function getMenuByTenant(tenantId: string): Promise<MenuCategory[]> {
  const supabase = getSupabase();

  const [catsRes, itemsRes] = await Promise.all([
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
  ]);

  const cats = (catsRes.data ?? []) as Array<{ id: string; name: string; sort_order: number }>;
  const items = (itemsRes.data ?? []) as MenuItem[];

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
  const res = await supabase
    .from('restaurant_menu_items')
    .select(ITEM_COLS)
    .eq('tenant_id', tenantId)
    .eq('is_available', true)
    .order('sort_order')
    .limit(limit);
  return (res.data ?? []) as MenuItem[];
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
  const items = (res.data ?? []) as MenuItem[];

  const matches = items.filter(
    (it) => it.id.replace(/-/g, '').slice(0, 8).toLowerCase() === shortId.toLowerCase(),
  );
  if (matches.length !== 1) return null;
  const item = matches[0];

  const modsRes = await supabase
    .from('restaurant_menu_modifiers')
    .select('id, name, price_delta_ron')
    .eq('item_id', item.id);
  const modifiers = (modsRes.data ?? []) as MenuModifier[];

  return { ...item, modifiers };
}
