// B2B Marketplace (admin / light) — friendly error card (spec §1.11, §2.9).
//
// Replaces raw `${err.message}` / PostgREST internal prints to the vendor.
// The raw message stays server-side (already logged by the platform — this
// component does NOT add logging, it just stops surfacing internals).

import * as React from 'react';
import { cn } from '@hir/ui';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  className?: string;
}

export function ErrorState({
  title = 'A apărut o eroare.',
  description = 'Reîncarcă pagina sau revino mai târziu.',
  className,
}: ErrorStateProps): JSX.Element {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800',
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 h-5 w-5 shrink-0 text-rose-600"
        aria-hidden
        focusable="false"
      >
        <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.42 0Z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {description ? <p className="mt-1 text-sm text-rose-700">{description}</p> : null}
      </div>
    </div>
  );
}
