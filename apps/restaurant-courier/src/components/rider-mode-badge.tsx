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
        <Truck className="h-3 w-3" aria-hidden />
        <span className="hidden sm:inline">Dispecerizat de</span>
        <span className="font-semibold">{fleetName ?? 'flota'}</span>
      </>
    );

    if (fleetContactPhone) {
      return (
        <a
          href={`tel:${fleetContactPhone}`}
          aria-label={`Sună dispecerul ${fleetName ?? ''}`.trim()}
          className="flex items-center gap-1.5 rounded-full border border-amber-700/40 bg-amber-950/40 px-2.5 py-1 text-[11px] font-medium text-amber-200 hover:bg-amber-900/40 active:scale-95"
        >
          {inner}
          <Phone className="h-3 w-3 text-amber-300" aria-hidden />
        </a>
      );
    }

    return (
      <div className="flex items-center gap-1.5 rounded-full border border-amber-700/40 bg-amber-950/40 px-2.5 py-1 text-[11px] font-medium text-amber-200">
        {inner}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-sky-700/40 bg-sky-950/40 px-2.5 py-1 text-[11px] font-medium text-sky-200">
      <Users className="h-3 w-3" aria-hidden />
      <span className="hidden sm:inline">Multi-vendor</span>
      <span className="font-semibold sm:hidden">
        <Briefcase className="inline h-3 w-3" aria-hidden /> {tenantCount}
      </span>
    </div>
  );
}
