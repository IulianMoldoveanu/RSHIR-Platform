import { createServerClient } from '@/lib/supabase/server';
import { getActiveTenant } from '@/lib/tenant';
import { ZonesClient } from './zones-client';
import type { Zone, Tier } from './types';

export const dynamic = 'force-dynamic';

export default async function ZonesPage() {
  const { tenant } = await getActiveTenant();
  const supabase = createServerClient();

  const [zonesRes, tiersRes] = await Promise.all([
    supabase
      .from('delivery_zones')
      .select('id, name, polygon, is_active, sort_order, created_at')
      .eq('tenant_id', tenant.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('delivery_pricing_tiers')
      .select('id, min_km, max_km, price_ron, sort_order')
      .eq('tenant_id', tenant.id)
      .order('min_km', { ascending: true }),
  ]);

  const zones = (zonesRes.data ?? []) as unknown as Zone[];
  const tiers = (tiersRes.data ?? []) as unknown as Tier[];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Zone livrare</h1>
        <p className="text-sm text-zinc-600">
          Desenează poligoane pe hartă pentru a defini zonele unde livrezi. Tarifele
          se aplică în funcție de distanța în km.
        </p>
      </div>

      <ZonesClient initialZones={zones} initialTiers={tiers} />
    </div>
  );
}
