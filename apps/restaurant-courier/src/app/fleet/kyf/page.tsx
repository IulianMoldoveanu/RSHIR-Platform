import Link from 'next/link';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { requireFleetManager } from '@/lib/fleet-manager';

export const dynamic = 'force-dynamic';

// 2026-06-15 — Per Iulian directive, fleet KYF document upload moved
// EXCLUSIVELY to the admin panel (app.hirforyou.ro/fleet/kyf). The courier
// PWA was never a great surface for managing company documents (designed
// for drivers on phones, with the camera capture UX) — fleet managers
// already work from desktop on app.hirforyou.ro to invoice/dispatch, so
// KYF lives there. Couriers (drivers) still upload their personal ID card
// on the courier app via /onboarding (separate flow).

const ADMIN_HOST = 'https://app.hirforyou.ro';

export default async function FleetKyfPage() {
  // Still gate on requireFleetManager so the back-link to /fleet/settings
  // makes sense.
  await requireFleetManager();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Link
        href="/fleet/settings"
        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        Înapoi la setări
      </Link>

      <div className="rounded-xl border border-violet-500/40 bg-violet-500/10 p-5">
        <h1 className="text-lg font-semibold text-zinc-100">Verificarea firmei se face în panou</h1>
        <p className="mt-2 text-sm text-zinc-300">
          Documentele KYF (act constitutiv, extras de cont, certificat înregistrare ONRC) se
          încarcă în panoul de control al flotei pe <strong>app.hirforyou.ro/fleet/kyf</strong> —
          o singură locație, pe desktop, cu drag-and-drop.
        </p>
        <p className="mt-2 text-xs text-zinc-400">
          Pe aplicația HIR Curier rămâne doar fluxul curierilor (încărcare buletin la onboarding).
        </p>
        <a
          href={`${ADMIN_HOST}/fleet/kyf`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500"
        >
          Deschide panoul
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </div>
  );
}
