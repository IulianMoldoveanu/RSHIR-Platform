import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// /fleet/couriers — fleet manager sees own riders + their KYC status.
// Native admin app surface (parallel to courier.hirforyou.ro/fleet/couriers
// which is the PWA-side view). Native means no cross-host session jump.
// Display name uses fleet display_prefix ("ELS Filip Adrian") so the manager
// scans fast when running a multi-fleet operation.

type CourierRow = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  vehicle_type: string | null;
  city: string | null;
  status: 'INACTIVE' | 'ACTIVE' | 'SUSPENDED';
  created_at: string;
};

type KycRow = {
  courier_user_id: string;
  kyc_status: 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  submitted_at: string | null;
  verified_at: string | null;
};

function statusBadge(status: CourierRow['status']) {
  if (status === 'ACTIVE') return { label: 'Activ', cls: 'bg-emerald-100 text-emerald-700' };
  if (status === 'SUSPENDED') return { label: 'Suspendat', cls: 'bg-rose-100 text-rose-700' };
  return { label: 'Inactiv', cls: 'bg-zinc-100 text-zinc-600' };
}

function kycBadge(status: KycRow['kyc_status'] | undefined, hasSubmitted: boolean) {
  if (status === 'VERIFIED') return { label: 'KYC aprobat', cls: 'bg-emerald-100 text-emerald-700' };
  if (status === 'REJECTED') return { label: 'KYC respins', cls: 'bg-rose-100 text-rose-700' };
  if (hasSubmitted) return { label: 'KYC in asteptare', cls: 'bg-amber-100 text-amber-700' };
  return { label: 'KYC nedepus', cls: 'bg-zinc-100 text-zinc-500' };
}

export default async function FleetCouriersPage() {
  const supa = await createServerClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) redirect('/login');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: fleet } = await admin
    .from('courier_fleets')
    .select('id, name, display_prefix, primary_city_id')
    .eq('owner_user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!fleet) redirect('/fleet-signup');

  const { data: couriersData } = await admin
    .from('courier_profiles')
    .select('user_id, full_name, phone, vehicle_type, city, status, created_at')
    .eq('fleet_id', fleet.id)
    .order('created_at', { ascending: false })
    .limit(200);
  const couriers = (couriersData ?? []) as CourierRow[];

  const userIds = couriers.map((c) => c.user_id);
  const kycMap = new Map<string, KycRow>();
  if (userIds.length > 0) {
    const { data: kycData } = await admin
      .from('courier_kyc')
      .select('courier_user_id, kyc_status, submitted_at, verified_at')
      .in('courier_user_id', userIds);
    for (const row of (kycData ?? []) as KycRow[]) {
      kycMap.set(row.courier_user_id, row);
    }
  }

  const prefix = fleet.display_prefix as string | null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Curierii mei</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Curierii alocați la flota <strong>{fleet.name}</strong>{' '}
            {prefix ? <span className="ml-1 rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-semibold text-indigo-700">{prefix}</span> : null}.
            Numele apare prefixat în panoul HIR ca admin să identifice rapid flota.
          </p>
        </div>
        <a
          href="https://courier.hirforyou.ro/fleet/couriers/invite"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          + Invită curier
        </a>
      </div>

      {couriers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center">
          <p className="text-sm text-zinc-700">
            Niciun curier alocat încă. Invită primul curier din butonul de mai sus.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Curierul primește un email cu link de activare (de la noreply@hirforyou.ro).
            Își setează parola și încarcă buletinul în aplicația HIR Curier, apoi tu vezi
            verificarea în panoul Iulian de aprobare.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Nume afișat</th>
                <th className="px-4 py-2.5 font-medium">Telefon</th>
                <th className="px-4 py-2.5 font-medium">Vehicul</th>
                <th className="px-4 py-2.5 font-medium">Oraș</th>
                <th className="px-4 py-2.5 text-center font-medium">Status</th>
                <th className="px-4 py-2.5 text-center font-medium">KYC</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {couriers.map((c) => {
                const kyc = kycMap.get(c.user_id);
                const hasSubmitted = Boolean(kyc?.submitted_at);
                const sBadge = statusBadge(c.status);
                const kBadge = kycBadge(kyc?.kyc_status ?? null, hasSubmitted);
                const displayName = prefix && c.full_name ? `${prefix} ${c.full_name}` : c.full_name ?? '—';
                return (
                  <tr key={c.user_id} className="border-t border-zinc-100 hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-zinc-900">{displayName}</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-700">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-zinc-700">{c.vehicle_type ?? '—'}</td>
                    <td className="px-4 py-3 text-zinc-700">{c.city ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${sBadge.cls}`}>
                        {sBadge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${kBadge.cls}`}>
                        {kBadge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`https://courier.hirforyou.ro/fleet/couriers/${c.user_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-indigo-600 hover:underline"
                      >
                        Detalii →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
