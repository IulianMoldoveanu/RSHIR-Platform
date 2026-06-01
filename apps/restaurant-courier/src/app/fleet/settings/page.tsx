import Link from 'next/link';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { requireFleetManager } from '@/lib/fleet-manager';
import { FleetSettingsForm } from './_form';

export const dynamic = 'force-dynamic';

export default async function FleetSettingsPage() {
  const fleet = await requireFleetManager();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Setări flotă</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Numele și culoarea apar pe ecranul curierilor; telefonul devine
          buton tap-to-call pentru curierii dispecerizați.
        </p>
      </div>

      <FleetSettingsForm
        initial={{
          name: fleet.name,
          brandColor: fleet.brandColor ?? '#7c3aed',
          contactPhone: fleet.contactPhone ?? '',
        }}
      />

      <Link
        href="/fleet/kyf"
        className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition hover:border-violet-500/50 hover:bg-zinc-900/60"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-violet-300">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold text-zinc-100">Verificare firmă (KYF)</span>
          <span className="block text-xs text-zinc-500">
            CUI verificat la ANAF + acte. Necesar pentru ca flota să poată opera.
          </span>
        </span>
        <ChevronRight className="h-4 w-4 text-zinc-500" aria-hidden />
      </Link>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-xs text-zinc-500">
        <p className="mb-2 font-semibold uppercase tracking-wide text-zinc-400">
          Identificator flotă
        </p>
        <p className="font-mono text-zinc-300">{fleet.slug}</p>
        <p className="mt-2">
          Slug-ul + tier-ul pot fi modificate doar de echipa HIR.
        </p>
      </section>
    </div>
  );
}
