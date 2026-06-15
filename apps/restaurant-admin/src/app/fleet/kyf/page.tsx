import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// /fleet/kyf — KYF document review surface. Today this is read-only on
// the admin host: actual upload happens on courier.hirforyou.ro/fleet/kyf
// where the dropzone + camera capture flow lives (built for mobile fleet
// managers on the PWA). This page surfaces status + a deep link.

type KyfRow = {
  kyf_status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  cui: string | null;
  company_name: string | null;
  reg_com_no: string | null;
  rejection_reason: string | null;
  updated_at: string | null;
};

export default async function FleetKyfPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  const { data: kyfData } = await admin
    .from('fleet_kyf')
    .select('kyf_status, cui, company_name, reg_com_no, rejection_reason, updated_at')
    .eq('fleet_id', fleet.id)
    .maybeSingle();
  const kyf = kyfData as KyfRow | null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Verificare KYF</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Pentru a opera flota pe HIR trebuie sa verificam identitatea companiei si a administratorului.
          Toate documentele sunt criptate si vizibile doar pentru administratorul HIR.
        </p>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Datele firmei</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-zinc-500">CUI</dt>
            <dd className="text-zinc-900">{kyf?.cui ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Firma</dt>
            <dd className="text-zinc-900">{kyf?.company_name ?? fleet.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Reg. Comertului</dt>
            <dd className="text-zinc-900">{kyf?.reg_com_no ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Status</dt>
            <dd>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                  kyf?.kyf_status === 'VERIFIED'
                    ? 'bg-emerald-100 text-emerald-700'
                    : kyf?.kyf_status === 'REJECTED'
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-amber-100 text-amber-700'
                }`}
              >
                {kyf?.kyf_status ?? 'PENDING'}
              </span>
            </dd>
          </div>
        </dl>
        {kyf?.rejection_reason ? (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <strong>Motiv respingere:</strong> {kyf.rejection_reason}
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Incarcare documente</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Fluxul de incarcare documente (CUI, certificat ONRC, asigurare RCA flota, ID administrator,
          ITP) este disponibil pe aplicatia HIR Curier — mult mai usor cu camera de pe telefon. Daca esti
          pe desktop, scaneaza cu telefonul codul QR primit pe email sau acceseaza direct linkul.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href="https://courier.hirforyou.ro/fleet/kyf"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Incarca pe HIR Curier
          </a>
          <a
            href="mailto:contact@hirforyou.ro?subject=KYF%20flota"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Trimite pe email
          </a>
        </div>
      </section>
    </div>
  );
}
