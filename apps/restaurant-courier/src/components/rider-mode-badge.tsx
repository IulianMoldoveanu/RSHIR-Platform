'use client';

import { Briefcase, Users, Truck } from 'lucide-react';
import { useRiderMode } from './rider-mode-provider';

// Top-bar mode indicator. Rider sees the chip silently — no setting, no
// toggle. Mode C surfaces FM identity ("Dispatched by {fleetName}") which
// is the primary trust signal for fleet-managed riders. Mode B chips with
// "Multi-vendor" so the rider knows orders may come from many tenants.
// Mode A is intentionally invisible (the simplest variant has no chrome).
export function RiderModeBadge() {
  const { mode, fleetName, tenantCount } = useRiderMode();

  if (mode === 'A') return null;

  if (mode === 'C') {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-amber-700/40 bg-amber-950/40 px-2.5 py-1 text-[11px] font-medium text-amber-200">
        <Truck className="h-3 w-3" aria-hidden />
        <span className="hidden sm:inline">Dispecerizat de</span>
        <span className="font-semibold">{fleetName ?? 'flota'}</span>
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
