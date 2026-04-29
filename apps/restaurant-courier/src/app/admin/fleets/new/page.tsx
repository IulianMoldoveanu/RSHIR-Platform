// /admin/fleets/new — create a new fleet. PLATFORM_ADMIN only (enforced by layout).

import { requirePlatformAdmin } from '@/lib/platform-admin';
import { NewFleetForm } from './_form';

export default async function NewFleetPage() {
  await requirePlatformAdmin();
  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Fleet nou</h1>
        <p className="mt-0.5 text-sm text-zinc-500">Creează o flotă de curieri cu configurare completă.</p>
      </div>
      <NewFleetForm />
    </div>
  );
}
