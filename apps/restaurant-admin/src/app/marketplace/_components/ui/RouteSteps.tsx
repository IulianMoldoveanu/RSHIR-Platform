// B2B Marketplace (admin / light) — pickup → dropoff route block (spec §2.7).
//
// From preview `.pickup-drop`: a vertical two-step timeline, green dot =
// PICKUP, mov dot = DROPOFF, connected by a hairline, uppercase micro-labels,
// address in body weight. Optional redacted-phone line under the dropoff.
//
// Pure presentation — takes already-summarized address strings (callers keep
// their summarizeAddress / addressSummary helpers; those are not styling).

import * as React from 'react';
import { cn } from '@hir/ui';

export interface RouteStepsProps {
  pickup: string;
  dropoff: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  redactedPhone?: string | null;
  className?: string;
}

export function RouteSteps({
  pickup,
  dropoff,
  pickupLabel = 'Ridicare',
  dropoffLabel = 'Livrare',
  redactedPhone,
  className,
}: RouteStepsProps): JSX.Element {
  return (
    <ol className={cn('relative space-y-4', className)}>
      {/* connecting hairline */}
      <span
        aria-hidden
        className="absolute left-[5px] top-2 bottom-2 w-px bg-gradient-to-b from-emerald-400 to-[#8e3bb0]"
      />
      <li className="relative flex gap-3">
        <span
          aria-hidden
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 ring-2 ring-white"
        />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {pickupLabel}
          </p>
          <p className="text-sm text-slate-700">{pickup}</p>
        </div>
      </li>
      <li className="relative flex gap-3">
        <span
          aria-hidden
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#6b1f8a] ring-2 ring-white"
        />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {dropoffLabel}
          </p>
          <p className="text-sm text-slate-700">{dropoff}</p>
          {redactedPhone ? (
            <p className="mt-0.5 text-xs tabular-nums text-slate-500">{redactedPhone}</p>
          ) : null}
        </div>
      </li>
    </ol>
  );
}
