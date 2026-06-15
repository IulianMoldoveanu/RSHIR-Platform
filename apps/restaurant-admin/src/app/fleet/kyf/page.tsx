import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { KyfUploadForm } from './kyf-upload-form';

export const dynamic = 'force-dynamic';

// /fleet/kyf — KYF upload happens HERE, on the admin panel. Per Iulian
// directive 2026-06-15: fleet managers do NOT go to the courier app to
// upload company documents. Only couriers (drivers) upload their ID card
// later, on the courier app, after the fleet manager invites them.

type KyfRow = {
  fleet_id: string;
  cui: string | null;
  company_name: string | null;
  reg_com: string | null;
  caen_code: string | null;
  address: string | null;
  iban: string | null;
  act_constitutiv_url: string | null;
  extras_cont_url: string | null;
  certificat_inreg_url: string | null;
  kyf_status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  rejected_reason: string | null;
  submitted_at: string | null;
  verified_at: string | null;
};

export default async function FleetKyfPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  const { data } = await admin
    .from('fleet_kyf')
    .select('*')
    .eq('fleet_id', fleet.id)
    .maybeSingle();
  const kyf = (data as KyfRow | null) ?? null;

  const isVerified = kyf?.kyf_status === 'VERIFIED';
  const isRejected = kyf?.kyf_status === 'REJECTED';
  const submitted = Boolean(kyf?.submitted_at);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Verificare KYF</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Incarca documentele de identificare ale companiei. Toate sunt criptate si vizibile doar pentru
          administratorul HIR. Aprobarea dureaza de regula sub 24h.
        </p>
      </div>

      {isVerified ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <strong>Verificare confirmata.</strong> Flota este activa pe HIR. Toate functiile sunt deblocate.
        </div>
      ) : isRejected ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <strong>Verificare respinsa.</strong>
          {kyf?.rejected_reason ? <span className="ml-1">Motiv: {kyf.rejected_reason}.</span> : null}
          <span className="ml-1">Corecteaza documentele si retrimite mai jos.</span>
        </div>
      ) : submitted ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Verificare in curs.</strong> Documentele au fost trimise
          {kyf?.submitted_at ? ` la ${new Date(kyf.submitted_at).toLocaleString('ro-RO')}` : ''}.
          Iti raspundem in sub 24h.
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
          Incarca cele 3 documente + IBAN + Reg. Comertului. Cand sunt complete, apasa{' '}
          <strong>&ldquo;Trimite spre verificare&rdquo;</strong>.
        </div>
      )}

      <KyfUploadForm
        fleetName={fleet.name as string}
        kyf={kyf}
        readOnly={isVerified}
      />
    </div>
  );
}
