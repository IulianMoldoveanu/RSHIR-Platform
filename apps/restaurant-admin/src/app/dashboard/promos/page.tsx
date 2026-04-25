import { createServerClient } from '@/lib/supabase/server';
import { getActiveTenant } from '@/lib/tenant';
import { PromosClient, type PromoRow } from './promos-client';

export const dynamic = 'force-dynamic';

export default async function PromosPage() {
  const { tenant } = await getActiveTenant();
  const supabase = createServerClient();

  const { data } = await supabase
    .from('promo_codes')
    .select(
      'id, code, kind, value_int, min_order_ron, max_uses, used_count, valid_from, valid_until, is_active, created_at',
    )
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false });

  const promos = (data ?? []) as unknown as PromoRow[];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Coduri reducere</h1>
        <p className="text-sm text-zinc-600">
          Creează coduri promo pe care clienții le pot aplica la checkout. Maxim
          un cod per comandă.
        </p>
      </div>

      <PromosClient initialPromos={promos} tenantId={tenant.id} />
    </div>
  );
}
