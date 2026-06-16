// /admin/couriers — courier roster across all fleets with fleet/city transfer.
// PLATFORM_ADMIN only (also enforced by admin/layout.tsx).

import { requirePlatformAdmin } from '@/lib/platform-admin';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import { CouriersTransferClient } from './_client';

export const dynamic = 'force-dynamic';

type RawCourier = {
  user_id: string;
  full_name: string;
  phone: string | null;
  status: string;
  fleet_id: string | null;
  city: string | null;
  courier_fleets: { name: string } | { name: string }[] | null;
};

// PostgREST returns an embedded many-to-one as an object, but supabase-js
// typings sometimes surface it as a one-element array — normalize both.
function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export default async function AdminCouriersPage() {
  await requirePlatformAdmin();

  const sb = createAdminClientUntyped();

  const { data: couriersRaw, error } = await sb
    .from('courier_profiles')
    .select('user_id, full_name, phone, status, fleet_id, city, courier_fleets(name)')
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

  // City catalog drives the transfer dropdown; the chosen NAME is stored on
  // courier_profiles.city (text). Active cities first.
  const { data: cities } = await sb
    .from('cities')
    .select('name, county, is_active')
    .order('is_active', { ascending: false })
    .order('name', { ascending: true });

  const couriers = ((couriersRaw ?? []) as RawCourier[]).map((c) => ({
    user_id: c.user_id,
    full_name: c.full_name,
    phone: c.phone,
    status: c.status,
    fleet_id: c.fleet_id,
    city: c.city,
    fleet_name: one(c.courier_fleets)?.name ?? null,
  }));

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
        cities={(cities ?? []) as { name: string; county: string | null; is_active: boolean }[]}
      />
    </div>
  );
}
