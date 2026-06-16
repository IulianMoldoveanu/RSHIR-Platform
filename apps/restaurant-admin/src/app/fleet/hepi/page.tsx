import { createServerClient } from '@/lib/supabase/server';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// /fleet/hepi — Hepi (AI copilot) for fleet managers. Gated on
// fleet_kyf.kyf_status = VERIFIED per Iulian directive 2026-06-15:
// "dupa ce i s a confirmat contul sa aiba acces la hepi self
// improvements". Unverified fleet managers see a locked panel.

export default async function FleetHepiPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClientUntyped();
  const { data: fleet } = await admin
    .from('courier_fleets')
    .select('id, name')
    .eq('owner_user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!fleet) redirect('/fleet-signup');

  const { data: kyf } = await admin
    .from('fleet_kyf')
    .select('kyf_status')
    .eq('fleet_id', fleet.id)
    .maybeSingle();
  const verified = kyf?.kyf_status === 'VERIFIED';

  if (!verified) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <h1 className="text-base font-semibold text-zinc-900">
            Hepi este deblocat dupa verificarea KYF
          </h1>
          <p className="mt-2 text-sm text-zinc-700">
            Asistentul AI iti recomanda ajustari personalizate (zone, ore, curieri) bazat pe datele
            flotei tale. Disponibil dupa ce administratorul HIR aproba documentele.
          </p>
          <a
            href="/fleet/kyf"
            className="mt-4 inline-block rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Du-ma la KYF
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Hepi — self improvements</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Recomandari personalizate pentru flota {fleet.name}, generate pe datele tale operationale.
        </p>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">
        Sectiunea Hepi pentru flota se integreaza in roadmap. Pana atunci, contacteaza-ne pe
        contact@hirforyou.ro cu intrebari concrete despre operatiuni — raspundem rapid.
      </div>
    </div>
  );
}
