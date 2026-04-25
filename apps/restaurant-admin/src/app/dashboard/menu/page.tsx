import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import { MenuTabs } from './menu-tabs';

export const dynamic = 'force-dynamic';

export type MenuCategory = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type MenuItem = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_ron: number;
  image_url: string | null;
  is_available: boolean;
  sold_out_until: string | null;
  tags: string[];
};

export type MenuModifier = {
  id: string;
  item_id: string;
  name: string;
  price_delta_ron: number;
};

export default async function MenuPage() {
  const { tenant } = await getActiveTenant();
  const admin = createAdminClient();

  const [catsRes, itemsRes, modsRes] = await Promise.all([
    admin
      .from('restaurant_menu_categories')
      .select('id, name, sort_order, is_active')
      .eq('tenant_id', tenant.id)
      .order('sort_order', { ascending: true }),
    admin
      .from('restaurant_menu_items')
      .select('id, category_id, name, description, price_ron, image_url, is_available, sold_out_until, tags')
      .eq('tenant_id', tenant.id)
      .order('name', { ascending: true }),
    admin
      .from('restaurant_menu_modifiers')
      .select('id, item_id, name, price_delta_ron, restaurant_menu_items!inner(tenant_id)')
      .eq('restaurant_menu_items.tenant_id', tenant.id),
  ]);

  if (catsRes.error) throw new Error(catsRes.error.message);
  if (itemsRes.error) throw new Error(itemsRes.error.message);
  if (modsRes.error) throw new Error(modsRes.error.message);

  const categories = (catsRes.data ?? []) as MenuCategory[];
  const items = (itemsRes.data ?? []) as MenuItem[];
  const modifiers = ((modsRes.data ?? []) as Array<MenuModifier & { restaurant_menu_items?: unknown }>).map(
    ({ id, item_id, name, price_delta_ron }) => ({ id, item_id, name, price_delta_ron }),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Meniu</h1>
        <p className="text-xs text-zinc-500">{tenant.name}</p>
      </div>
      <MenuTabs categories={categories} items={items} modifiers={modifiers} />
    </div>
  );
}
