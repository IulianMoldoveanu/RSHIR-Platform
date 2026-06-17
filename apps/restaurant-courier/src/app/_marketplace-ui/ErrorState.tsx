// B2B Marketplace (courier dark theme) — ErrorState.
//
// Friendly ro-RO error card (§2.9) that replaces raw `error.message` /
// PostgREST-internal prints on the vendor/fleet surface. The raw message
// stays server-side (already logged by the platform — this component adds no
// logging and surfaces nothing sensitive). Dark rose tone.

import * as React from 'react';
import { MarketplaceIcon } from './_icons';

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
      className={[
        'flex items-start gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="mt-0.5 flex-shrink-0 text-rose-300">
        <MarketplaceIcon name="alertTriangle" className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-rose-100">{title}</p>
        {description ? <p className="mt-0.5 text-sm text-rose-200/80">{description}</p> : null}
      </div>
    </div>
  );
}
