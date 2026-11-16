import { createServerClient } from '@/lib/supabase/server';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// /fleet/hepi — Hepi (AI copilot) for fleet managers. Open to any fleet
// owner: the KYF gate that used to lock this panel was removed on
// 2026-11-16 along with KYF itself.

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
