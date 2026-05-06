import { createServerClient } from '@/lib/supabase/server';
import { getActiveTenant } from '@/lib/tenant';
import { ZonesClient } from './zones-client';
import type { Zone, Tier } from './types';

export const dynamic = 'force-dynamic';

type TenantLocationSettings = {
  location?: { lat?: number; lng?: number } | null;
  city?: string | null;
};

export default async function ZonesPage() {
  const { tenant } = await getActiveTenant();
  const supabase = createServerClient();

  let zones: Zone[] = [];
  let tiers: Tier[] = [];
  let loadError: string | null = null;

  try {
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

    if (zonesRes.error) {
      console.error('[zones] delivery_zones load failed', {
        tenantId: tenant.id,
        message: zonesRes.error.message,
        code: zonesRes.error.code,
      });
      loadError = zonesRes.error.message;
    }
    if (tiersRes.error) {
      console.error('[zones] delivery_pricing_tiers load failed', {
        tenantId: tenant.id,
        message: tiersRes.error.message,
        code: tiersRes.error.code,
      });
      if (!loadError) loadError = tiersRes.error.message;
    }

    zones = ((zonesRes.data ?? []) as unknown as Zone[]).filter(
      (z) => z.polygon && Array.isArray(z.polygon.coordinates),
    );
    tiers = (tiersRes.data ?? []) as unknown as Tier[];
  } catch (err) {
    console.error('[zones] unexpected load failure', {
      tenantId: tenant.id,
      error: err instanceof Error ? err.message : String(err),
    });
    loadError = err instanceof Error ? err.message : 'Eroare necunoscută la încărcare.';
  }

  let tenantCenter: { lat: number; lng: number } | null = null;
  let tenantCity: string | null = null;
  try {
    const tenantRes = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', tenant.id)
      .maybeSingle();
    const row = tenantRes.data as { settings?: unknown } | null;
    const settings = (row?.settings ?? {}) as TenantLocationSettings;
    if (
      typeof settings.location?.lat === 'number' &&
      typeof settings.location?.lng === 'number'
    ) {
      tenantCenter = { lat: settings.location.lat, lng: settings.location.lng };
    }
    if (typeof settings.city === 'string' && settings.city.trim().length > 0) {
      tenantCity = settings.city.trim();
    }
  } catch (err) {
    console.error('[zones] tenant settings load failed', {
      tenantId: tenant.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Zone livrare</h1>
        <p className="text-sm text-zinc-600">
          Desenează poligoane pe hartă pentru a defini zonele unde livrezi. Tarifele
          se aplică în funcție de distanța în km.
        </p>
      </div>

      {loadError ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Datele zonelor nu s-au putut încărca complet. Poți totuși desena zone noi pe hartă.
        </div>
      ) : null}

      <ZonesClient
        initialZones={zones}
        initialTiers={tiers}
        tenantCenter={tenantCenter}
        tenantCity={tenantCity}
      />
    </div>
  );
}
