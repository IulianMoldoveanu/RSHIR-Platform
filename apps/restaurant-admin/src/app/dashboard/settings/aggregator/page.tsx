// Lane HIRforYOU-MARKETPLACE (2026-05-28) — patron settings page for the
// consumer marketplace opt-in.
//
// Surfaced at /dashboard/settings/aggregator (URL matches the patron-facing
// wording "Aggregator" — the underlying schema lives under marketplace_*
// to avoid colliding with the existing aggregator-email-intake feature).

import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { AggregatorSettingsClient } from './client';

export const dynamic = 'force-dynamic';

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  aggregator_enabled: boolean | null;
  aggregator_visibility: 'private' | 'public' | 'invite_only' | null;
  city_id: string | null;
  cities: { slug: string | null } | null;
};

export default async function AggregatorSettingsPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);
  const canEdit = role === 'OWNER';

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = admin;

  const { data: tRow } = await sb
    .from('tenants')
    .select('id, slug, name, aggregator_enabled, aggregator_visibility, city_id, cities ( slug )')
    .eq('id', tenant.id)
    .maybeSingle();

  const row = (tRow as TenantRow | null) ?? null;
  const enabled = row?.aggregator_enabled === true;
  const visibility = (row?.aggregator_visibility ?? 'private') as 'private' | 'public' | 'invite_only';
  const citySlug = row?.cities?.slug ?? null;

  // Review count + 30-day order count for the eligibility card. Both are
  // independent of the materialized view (which lags by up to 24h).
  const [{ count: reviewCount }, { count: ordersLast30d }] = await Promise.all([
    sb
      .from('marketplace_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id),
    sb
      .from('restaurant_orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .neq('status', 'CANCELLED'),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-zinc-900">HIRforYOU Marketplace</h1>
        <p className="text-sm text-zinc-500">
          Controlezi dacă restaurantul tău apare pe hirforyou.ro/restaurante și cum este listat.
        </p>
      </header>

      <AggregatorSettingsClient
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        tenantName={tenant.name}
        citySlug={citySlug}
        canEdit={canEdit}
        enabled={enabled}
        visibility={visibility}
        reviewCount={reviewCount ?? 0}
        ordersLast30d={ordersLast30d ?? 0}
      />
    </div>
  );
}
