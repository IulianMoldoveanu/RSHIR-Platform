import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { requireFleetManager } from '@/lib/fleet-manager';
import { createAdminClient } from '@/lib/supabase/admin';
import { FleetSettingsForm } from './_form';
import { AutoDispatchToggle } from './_auto-dispatch-toggle';

export const dynamic = 'force-dynamic';

// Defensive read: returns false if courier_fleets.auto_dispatch_enabled doesn't
// exist yet (migration 20260630_038 not applied). Keeps the page working
// regardless of app-vs-migration deploy order — the feature just stays off.
async function readAutoDispatch(fleetId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await (admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{
              data: { auto_dispatch_enabled: boolean | null } | null;
              error: unknown;
            }>;
          };
        };
      };
    })
      .from('courier_fleets')
      .select('auto_dispatch_enabled')
      .eq('id', fleetId)
      .maybeSingle();
    if (error) return false;
    return Boolean(data?.auto_dispatch_enabled);
  } catch {
    return false;
  }
}

export default async function FleetSettingsPage() {
  const fleet = await requireFleetManager();
  const autoDispatch = await readAutoDispatch(fleet.fleetId);

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

      <AutoDispatchToggle initial={autoDispatch} />

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
