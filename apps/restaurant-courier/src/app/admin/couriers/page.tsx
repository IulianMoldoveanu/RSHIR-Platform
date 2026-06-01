// /admin/couriers — courier roster across all fleets with fleet/city transfer.
// PLATFORM_ADMIN only (also enforced by admin/layout.tsx).

import { requirePlatformAdmin } from '@/lib/platform-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { CouriersTransferClient } from './_client';

export const dynamic = 'force-dynamic';

type RawCourier = {
  user_id: string;
  full_name: string;
  phone: string | null;
  status: string;
  fleet_id: string | null;
  city_id: string | null;
  courier_fleets: { name: string } | { name: string }[] | null;
  cities: { name: string; county: string | null } | { name: string; county: string | null }[] | null;
};

// PostgREST returns an embedded many-to-one as an object, but supabase-js
// typings sometimes surface it as a one-element array — normalize both.
function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export default async function AdminCouriersPage() {
  await requirePlatformAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;

  const { data: couriersRaw, error } = await sb
    .from('courier_profiles')
    .select(
      'user_id, full_name, phone, status, fleet_id, city_id, courier_fleets(name), cities(name, county)',
    )
    .order('full_name', { ascending: true });

  if (error) {
    return (
      <p className="text-sm text-rose-400">
        Eroare la încărcarea curierilor: {error.message}
      </p>
    );
  }

  const { data: fleets } = await sb
    .from('courier_fleets')
    .select('id, name, is_active')
    .order('name', { ascending: true });

  const { data: cities } = await sb
    .from('cities')
    .select('id, name, county, is_active')
    .order('is_active', { ascending: false })
    .order('name', { ascending: true });

  const couriers = ((couriersRaw ?? []) as RawCourier[]).map((c) => {
    const fleet = one(c.courier_fleets);
    const city = one(c.cities);
    return {
      user_id: c.user_id,
      full_name: c.full_name,
      phone: c.phone,
      status: c.status,
      fleet_id: c.fleet_id,
      city_id: c.city_id,
      fleet_name: fleet?.name ?? null,
      city_name: city?.name ?? null,
      city_county: city?.county ?? null,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-hir-fg">Curieri</h1>
        <p className="mt-0.5 text-sm text-hir-muted-fg">
          {couriers.length} {couriers.length === 1 ? 'curier' : 'curieri'} · un cont = un oraș;
          transferă între flote și orașe
        </p>
      </div>

      <CouriersTransferClient
        couriers={couriers}
        fleets={(fleets ?? []) as { id: string; name: string; is_active: boolean }[]}
        cities={
          (cities ?? []) as { id: string; name: string; county: string | null; is_active: boolean }[]
        }
      />
    </div>
  );
}
