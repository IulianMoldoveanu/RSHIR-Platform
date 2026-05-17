'use client';

import { Briefcase, Users, Truck, Phone } from 'lucide-react';
import { useRiderMode } from './rider-mode-provider';

// Top-bar mode indicator. Rider sees the chip silently — no setting, no
// toggle. Mode C surfaces FM identity and turns into a tap-to-call link
// when the fleet has a contact_phone (RO market: tel: not chat per
// decision_courier_three_modes.md). Mode B chips with "Multi-vendor".
// Mode A is intentionally invisible (the simplest variant has no chrome).
export function RiderModeBadge() {
  const { mode, fleetName, fleetContactPhone, tenantCount } = useRiderMode();

  if (mode === 'A') return null;

  if (mode === 'C') {
    const inner = (
      <>
        <Truck className="h-3 w-3" aria-hidden strokeWidth={2.25} />
        <span className="hidden sm:inline">Dispecerizat de</span>
        <span className="font-semibold">{fleetName ?? 'flota'}</span>
      </>
    );

    if (fleetContactPhone) {
      return (
        <a
          href={`tel:${fleetContactPhone}`}
          aria-label={`Sună dispecerul ${fleetName ?? ''}`.trim()}
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-100 ring-1 ring-inset ring-amber-500/20 transition-colors hover:bg-amber-500/15 active:scale-95 focus-visible:outline-2 focus-visible:outline-amber-500 focus-visible:outline-offset-2"
        >
          {inner}
          <Phone className="h-3 w-3 text-amber-300" aria-hidden strokeWidth={2.25} />
        </a>
      );
    }

    return (
      <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-100 ring-1 ring-inset ring-amber-500/20">
        {inner}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-100 ring-1 ring-inset ring-sky-500/20">
      <Users className="h-3 w-3" aria-hidden strokeWidth={2.25} />
      <span className="hidden sm:inline">Multi-vendor</span>
      <span className="inline-flex items-center gap-1 font-semibold tabular-nums sm:hidden">
        <Briefcase className="inline h-3 w-3" aria-hidden strokeWidth={2.25} /> {tenantCount}
      </span>
    </div>
  );
}
