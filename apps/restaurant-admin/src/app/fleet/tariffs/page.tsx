import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { TariffsClient } from './tariffs-client';

export const dynamic = 'force-dynamic';

// /fleet/tariffs — fleet manager sets BOTH:
//   1. Tarif catre curieri (pickup + per_km + COD bonus) — what fleet PAYS
//   2. Tarif catre vendori (pickup + per_km + COD bonus) — what fleet CHARGES
// Per Iulian directive 2026-06-15.
// Auto-sync: courier app reads fleet_courier_tariffs directly. A save here
// reflects instantly in courier /fleet/earnings and the Monday payout cron.

type Tariff = {
  pickup_fee_cents: number | null;
  per_km_cents: number | null;
  cod_bonus_cents: number;
  valid_from: string;
  payout_cents: number | null;
} | null;

type VendorTariff = {
  pickup_fee_cents: number;
  per_km_cents: number;
  cod_bonus_cents: number;
  valid_from: string;
} | null;

export default async function FleetTariffsPage() {
  const supa = await createServerClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) redirect('/login');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: fleet } = await admin
    .from('courier_fleets')
    .select('id, name')
    .eq('owner_user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!fleet) redirect('/fleet-signup');

  const [courierRes, vendorRes, courierCount] = await Promise.all([
    admin
      .from('fleet_courier_tariffs')
      .select('pickup_fee_cents, per_km_cents, cod_bonus_cents, valid_from, payout_cents')
      .eq('fleet_id', fleet.id)
      .is('valid_until', null)
      .is('zone_id', null)
      .order('valid_from', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('fleet_vendor_tariffs')
      .select('pickup_fee_cents, per_km_cents, cod_bonus_cents, valid_from')
      .eq('fleet_id', fleet.id)
      .is('valid_until', null)
      .is('zone_id', null)
      .order('valid_from', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('courier_profiles')
      .select('user_id', { count: 'exact', head: true })
      .eq('fleet_id', fleet.id),
  ]);

  const courierTariff = courierRes.data as Tariff;
  const vendorTariff = vendorRes.data as VendorTariff;
  const allocatedCouriers = courierCount.count ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Tarife flotă</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Setezi două tarife independente: cât <strong>plătești</strong> curierilor tăi pe livrare și cât{' '}
          <strong>încasezi</strong> de la vendori. Ambele folosesc formula{' '}
          <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">pickup fix + RON/km</code>.
        </p>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 text-sm text-emerald-900">
        <p className="font-semibold">Auto-sync cu aplicația HIR Curier.</p>
        <p className="mt-1 text-emerald-800">
          Tariful pe care îl salvezi pentru curieri se aplică automat în aplicația lor (HIR Curier) la
          urmatoarea calculare de câștiguri/decontări. Nu trebuie să anunți pe nimeni — citesc același
          tabel ca tine. Acum ai{' '}
          <strong>{allocatedCouriers} {allocatedCouriers === 1 ? 'curier alocat' : 'curieri alocați'}</strong>.
        </p>
      </div>

      <TariffsClient
        fleetName={fleet.name as string}
        courier={courierTariff}
        vendor={vendorTariff}
      />
    </div>
  );
}
