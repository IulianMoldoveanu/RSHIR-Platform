import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireFleetManager } from '@/lib/fleet-manager';
import { InviteCourierForm } from './_form';

export const dynamic = 'force-dynamic';

// Self-serve invite: manager fills the form → server action either
// reuses the existing Supabase auth user or sends a magic-link invite,
// then upserts a courier_profiles row pointing at THIS fleet.
export default async function FleetInvitePage() {
  await requireFleetManager();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Link
        href="/fleet/couriers"
        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        Înapoi la curieri
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
          Invită curier
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Curierul primește un email cu link-ul de conectare și va apărea în
          flotă cu status <span className="text-zinc-300">Inactiv</span> până
          pornește prima tură.
        </p>
      </div>

      <InviteCourierForm />

      <section className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-500">
        <p className="font-semibold text-zinc-400">Note rapide</p>
        <ul className="mt-2 list-inside list-disc space-y-0.5">
          <li>Re-invitarea unui curier existent îl rebondează la flota ta.</li>
          <li>Telefonul este opțional; activează tap-to-call pe roster.</li>
          <li>Pentru reactivarea unui curier suspendat folosește butonul din pagina Curieri.</li>
        </ul>
      </section>
    </div>
  );
}
