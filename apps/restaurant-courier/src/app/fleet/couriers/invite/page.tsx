import Link from 'next/link';
import { ChevronLeft, MailQuestion } from 'lucide-react';
import { requireFleetManager } from '@/lib/fleet-manager';

export const dynamic = 'force-dynamic';

// Placeholder until self-serve invite is wired (next iteration). Today,
// rider invitations go through the platform-admin path which mints the
// auth user + courier_profile row. We surface contact info so the manager
// can request an invite without leaving the dashboard.
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
          Self-serve apare în zilele următoare. Până atunci, trimite emailul +
          numele curierului echipei HIR și îl activăm pentru flota ta.
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/10">
            <MailQuestion className="h-5 w-5 text-violet-300" aria-hidden />
          </span>
          <div className="flex-1">
            <p className="text-sm font-medium text-zinc-100">
              Trimite cererea pe email
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              <a
                href="mailto:contact@hir.ro?subject=Invitație%20curier%20flotă"
                className="text-violet-300 hover:text-violet-200"
              >
                contact@hir.ro
              </a>{' '}
              · răspundem în câteva ore.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-500">
        <p className="font-semibold text-zinc-400">Ce să trimiți:</p>
        <ul className="mt-2 list-inside list-disc space-y-0.5">
          <li>Numele complet al curierului</li>
          <li>Email folosit la conectare</li>
          <li>Tip vehicul (bicicletă / scuter / mașină)</li>
          <li>Telefon (opțional, pentru tap-to-call)</li>
        </ul>
      </section>
    </div>
  );
}
