// /fleet-signup — self-serve onboarding for new fleet managers.
//
// Created 2026-06-11 per Iulian directive (no admin must hand-create new
// fleets; fleet managers self-onboard from login page). Email is auto-
// confirmed server-side (Supabase shared sender is rate-limited + blocked
// by Yahoo/Outlook — KYF review is the real gate). After signup the user
// can log in immediately; `courier_fleets` row exists for them (kyf_
// required=true, is_active=false) and the dashboard layout redirects them
// to /fleet/kyf (on the courier PWA host) to upload KYF docs. Iulian
// approves from /dashboard/admin/verifications → kyf_status=VERIFIED,
// is_active=true.

import { FleetSignupForm } from './fleet-signup-form';
import { listActiveCities } from '@/lib/cities';

export const dynamic = 'force-dynamic';

export default async function FleetSignupPage() {
  // 2026-06-15 — Surface active cities to the picker so the fleet manager
  // explicitly chooses where the fleet operates. Pairs with the new
  // courier_fleets.primary_city_id column (migration 20260615_004) so
  // fleet-allocation can match fleet↔tenant city correctly.
  const cities = await listActiveCities();

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold text-zinc-900">Înregistrează o flotă</h1>
          <p className="text-sm text-zinc-600">
            Operezi o flotă de curieri și vrei să livrezi pentru restaurante,
            florării sau alți vendori? Completează formularul de mai jos —
            după validarea KYF începi să operezi.
          </p>
        </div>
        <FleetSignupForm cities={cities} />
        <p className="text-center text-xs text-zinc-500">
          Ai deja cont?{' '}
          <a href="/login" className="underline">
            Conectează-te
          </a>
        </p>
      </div>
    </main>
  );
}
