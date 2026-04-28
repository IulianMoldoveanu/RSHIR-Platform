import { ExternalLink } from 'lucide-react';
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
  sort_order: number;
  tags: string[];
  prep_minutes: number | null;
  serving_size_grams: number | null;
  serving_size_label: string | null;
};

export type MenuModifier = {
  id: string;
  item_id: string;
  name: string;
  price_delta_ron: number;
  group_id?: string | null;
  sort_order?: number;
};

export type MenuModifierGroup = {
  id: string;
  item_id: string;
  name: string;
  is_required: boolean;
  select_min: number;
  select_max: number | null;
  sort_order: number;
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
      .select('id, category_id, name, description, price_ron, image_url, is_available, sold_out_until, sort_order, tags, prep_minutes, serving_size_grams, serving_size_label')
      .eq('tenant_id', tenant.id)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    // Defensive: try the SELECT including new columns; fall back if the
    // 20260505_001 migration hasn't shipped yet.
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await (admin
        .from('restaurant_menu_modifiers')
        .select('id, item_id, name, price_delta_ron, group_id, sort_order, restaurant_menu_items!inner(tenant_id)') as any)
        .eq('restaurant_menu_items.tenant_id', tenant.id);
      if (r.error && /group_id|sort_order/i.test(r.error.message ?? '')) {
        return admin
          .from('restaurant_menu_modifiers')
          .select('id, item_id, name, price_delta_ron, restaurant_menu_items!inner(tenant_id)')
          .eq('restaurant_menu_items.tenant_id', tenant.id);
      }
      return r;
    })(),
  ]);

  // Pull modifier groups separately; defensive on the table existing.
  let groupRows: MenuModifierGroup[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = await (admin as any)
      .from('restaurant_menu_modifier_groups')
      .select('id, item_id, name, is_required, select_min, select_max, sort_order, restaurant_menu_items!inner(tenant_id)')
      .eq('restaurant_menu_items.tenant_id', tenant.id);
    if (!g.error && Array.isArray(g.data)) {
      groupRows = g.data.map(
        (row: {
          id: string;
          item_id: string;
          name: string;
          is_required: boolean;
          select_min: number;
          select_max: number | null;
          sort_order: number;
        }) => ({
          id: row.id,
          item_id: row.item_id,
          name: row.name,
          is_required: row.is_required,
          select_min: row.select_min,
          select_max: row.select_max,
          sort_order: row.sort_order,
        }),
      );
    }
  } catch {
    groupRows = [];
  }

  if (catsRes.error) throw new Error(catsRes.error.message);
  if (itemsRes.error) throw new Error(itemsRes.error.message);
  if (modsRes.error) throw new Error(modsRes.error.message);

  const categories = (catsRes.data ?? []) as MenuCategory[];
  const items = (itemsRes.data ?? []) as MenuItem[];
  const modifiers = ((modsRes.data ?? []) as Array<MenuModifier & { restaurant_menu_items?: unknown }>).map(
    ({ id, item_id, name, price_delta_ron, group_id, sort_order }) => ({
      id,
      item_id,
      name,
      price_delta_ron,
      group_id: group_id ?? null,
      sort_order: typeof sort_order === 'number' ? sort_order : 0,
    }),
  );

  const primaryDomain = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || 'lvh.me';
  const storefrontUrl = `https://${tenant.slug}.${primaryDomain}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Meniu</h1>
        <div className="flex items-center gap-3">
          <a
            href={storefrontUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Previzualizare client
          </a>
          <p className="text-xs text-zinc-500">{tenant.name}</p>
        </div>
      </div>
      <MenuTabs categories={categories} items={items} modifiers={modifiers} modifierGroups={groupRows} />
    </div>
  );
}
