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
