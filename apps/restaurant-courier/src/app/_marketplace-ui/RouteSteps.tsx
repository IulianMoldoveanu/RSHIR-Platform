// B2B Marketplace (courier dark theme) — RouteSteps.
//
// Pickup → Dropoff vertical two-step block (§1.9 / §2.7): green dot = pickup,
// violet dot = dropoff, connected by a hairline, uppercase micro-labels,
// address in body weight, optional redacted-phone line under the dropoff.
//
// Pure presentation — takes already-summarized strings (callers keep their
// `summarizeAddress` / `addressSummary` helpers; those are not styling).

import * as React from 'react';

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
  pickupLabel = 'RIDICARE',
  dropoffLabel = 'LIVRARE',
  redactedPhone,
  className,
}: RouteStepsProps): JSX.Element {
  return (
    <ol className={['relative flex flex-col gap-4', className ?? ''].filter(Boolean).join(' ')}>
      {/* Connecting hairline between the two dots. */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-[5px] top-2 bottom-2 w-px bg-gradient-to-b from-emerald-500/60 to-violet-500/60"
      />

      <li className="relative flex gap-3">
        <span
          aria-hidden
          className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-emerald-400 ring-2 ring-emerald-400/30"
        />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
            {pickupLabel}
          </p>
          <p className="text-sm font-medium text-hir-fg">{pickup}</p>
        </div>
      </li>

      <li className="relative flex gap-3">
        <span
          aria-hidden
          className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-violet-400 ring-2 ring-violet-400/30"
        />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
            {dropoffLabel}
          </p>
          <p className="text-sm font-medium text-hir-fg">{dropoff}</p>
          {redactedPhone ? (
            <p className="mt-0.5 text-xs tabular-nums text-hir-muted-fg">{redactedPhone}</p>
          ) : null}
        </div>
      </li>
    </ol>
  );
}
