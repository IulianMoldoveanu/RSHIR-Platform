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
import { loadGridData } from '@/lib/fleet-allocation/queries';
import { FleetAllocationClient } from './fleet-allocation-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function FleetAllocationPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login?next=/dashboard/admin/fleet-allocation');

  const allowList = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!allowList.includes(user.email.toLowerCase())) {
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

        <FleetAllocationClient
          fleets={grid.fleets}
          restaurants={grid.restaurants}
          assignments={grid.assignments}
        />
      </div>
    </main>
  );
}
