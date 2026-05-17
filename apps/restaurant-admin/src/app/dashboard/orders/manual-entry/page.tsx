import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import { ManualEntryClient } from './manual-entry-client';

export const dynamic = 'force-dynamic';

export type ManualMenuItem = {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  price_ron: number;
  is_available: boolean;
};

export default async function ManualEntryPage() {
  const { tenant } = await getActiveTenant();
  const admin = createAdminClient();

  const [catsRes, itemsRes] = await Promise.all([
    admin
      .from('restaurant_menu_categories')
      .select('id, name')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('sort_order'),
    admin
      .from('restaurant_menu_items')
      .select('id, category_id, name, price_ron, is_available')
      .eq('tenant_id', tenant.id)
      .eq('is_available', true)
      .order('sort_order'),
  ]);

  const catNameById = new Map<string, string>(
    ((catsRes.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
  );

  const menu: ManualMenuItem[] = ((itemsRes.data ?? []) as Array<{
    id: string;
    category_id: string;
    name: string;
    price_ron: number;
    is_available: boolean;
  }>).map((it) => ({
    id: it.id,
    categoryId: it.category_id,
    categoryName: catNameById.get(it.category_id) ?? 'Alte produse',
    name: it.name,
    price_ron: Number(it.price_ron),
    is_available: it.is_available,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Comandă manuală</h1>
        <p className="text-sm text-zinc-500">Înregistrează rapid o comandă primită telefonic.</p>
      </header>
      <ManualEntryClient menu={menu} tenantId={tenant.id} />
    </div>
  );
}
