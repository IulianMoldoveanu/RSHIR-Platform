// /fleet-signup — self-serve onboarding for new fleet managers.
//
// Created 2026-06-11 per Iulian directive (no admin must hand-create new
// fleets; fleet managers self-onboard from login page). After successful
// signup the user receives an email confirmation; once they log in, a
// `courier_fleets` row exists for them (kyf_required=true, is_active=false)
// and the dashboard layout redirects them to /fleet/kyf (on the courier
// PWA host) to upload the required documents. Iulian approves the KYF
// from /dashboard/admin/verifications, which flips kyf_status to VERIFIED
// and is_active to true.

import { FleetSignupForm } from './fleet-signup-form';

export const dynamic = 'force-dynamic';

export default function FleetSignupPage() {
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
        <FleetSignupForm />
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
