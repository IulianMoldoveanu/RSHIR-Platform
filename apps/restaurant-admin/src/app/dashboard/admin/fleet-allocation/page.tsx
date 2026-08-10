// Platform-admin Fleet Allocation grid (PR1b).
//
// Shows restaurants × fleets matrix with per-cell assignment status. Each
// cell exposes an action menu (assign primary / assign secondary / promote
// secondary→primary / terminate). Side panel runs the demand-supply
// algorithm against current state and surfaces ranked recommendations
// (read-only — no auto-apply in V1).
//
// Internal-only. Gated by HIR_PLATFORM_ADMIN_EMAILS allow-list. Confidentiality:
// every fleet identity surfaced here is internal — merchants never see this
// page; per the "Fleet Network confidentiality" rule, the grid stays scoped
// to platform admins.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { loadGridData } from '@/lib/fleet-allocation/queries';
import { findCoverageGaps } from '@/lib/fleet-allocation/coverage';
import { FleetAllocationClient } from './fleet-allocation-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function FleetAllocationPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login?next=/dashboard/admin/fleet-allocation');

  if (!isPlatformAdminEmail(user.email)) {
    return (
      <main className="min-h-screen bg-zinc-50 p-10">
        <div className="mx-auto max-w-2xl rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Acces interzis: această pagină este rezervată administratorilor de
          platformă HIR.
        </div>
      </main>
    );
  }

  let grid: Awaited<ReturnType<typeof loadGridData>>;
  try {
    grid = await loadGridData();
  } catch (err) {
    return (
      <main className="min-h-screen bg-zinc-50 p-10">
        <div className="mx-auto max-w-2xl rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Eroare la încărcarea datelor: {(err as Error).message}
          <p className="mt-2 text-xs text-rose-700">
            Dacă mesajul menționează „fleet_restaurant_assignments” sau
            „fleet_zones”, migrația 20260507_011 nu a fost încă aplicată.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 p-6 sm:p-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-zinc-900">Alocare flote</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Asociați restaurante cu flote (primary + secondary). Algoritmul
            calculează utilizare = comenzi/oră ÷ (curieri × ținta orară) și
            recomandă potriviri în banda 3–5 (fără auto-aplicare).
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Panou intern. Restaurantele nu văd flota care livrează — văd doar
            „curier HIR”.
          </p>
        </header>

        <CoverageWarning gaps={findCoverageGaps(grid)} />

        <FleetAllocationClient
          fleets={grid.fleets}
          restaurants={grid.restaurants}
          assignments={grid.assignments}
        />
      </div>
    </main>
  );
}

// Vendors that are live but have nobody who can deliver for them. Renders
// nothing when there are none, so the page is unchanged on a healthy day.
//
// This is the preventive half of the 2026-08-10 load-test finding: a vendor
// with no fleet (or a fleet with no riders) takes orders that are cooked and
// then never offered to a courier. courier-health-monitor reports it once it
// has already happened; this says it before an order exists, on the screen
// where assigning a fleet is one click away.
function CoverageWarning({ gaps }: { gaps: ReturnType<typeof findCoverageGaps> }) {
  if (gaps.length === 0) return null;
  return (
    <section
      aria-label="Restaurante fără curieri"
      className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3"
    >
      <h2 className="text-sm font-semibold text-amber-900">
        {gaps.length === 1
          ? '1 restaurant activ nu are cine să-i livreze'
          : `${gaps.length} restaurante active nu au cine să le livreze`}
      </h2>
      <p className="mt-1 text-xs text-amber-800">
        Comenzile lor sunt acceptate și gătite, apoi nu sunt oferite niciunui curier. Alocă-le o
        flotă cu curieri activi din grila de mai jos.
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {gaps.map((g) => (
          <li key={g.tenantId} className="text-xs text-amber-900">
            <span className="font-medium">{g.name}</span>
            {g.cityName ? <span className="text-amber-700"> · {g.cityName}</span> : null}
            <span className="text-amber-700">
              {' — '}
              {g.reason === 'no_fleet_assigned'
                ? g.fleetName
                  ? `fără flotă alocată; rezerva „${g.fleetName}” nu are curieri activi`
                  : 'fără flotă alocată și fără flotă de rezervă'
                : `flota „${g.fleetName ?? '—'}” nu are niciun curier activ`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
