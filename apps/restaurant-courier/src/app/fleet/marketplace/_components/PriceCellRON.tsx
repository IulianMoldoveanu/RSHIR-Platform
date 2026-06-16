// B2B Marketplace — RON price cell.
//
// Stream 7/9 (shared UI). Renders a *_cents value (the DB convention across
// marketplace_listings.target_price_cents, marketplace_offers.offered_price_cents,
// marketplace_matches.final_price_cents / hir_fee_cents) as a localised RON
// amount.
//
// Why a dedicated component rather than calling formatRon directly:
//   1. The DB stores cents (integer). The shared `formatRon` from @hir/ui
//      takes a RON-unit number. Forgetting the /100 split is the #1 bug
//      this component prevents.
//   2. Tabular numerals + right-align come for free.
//   3. The `null/undefined → "—"` rendering is consistent across screens
//      (vendor table, fleet board, admin console).
//
// Locale is hard-coded to ro-RO because the marketplace is RO-only in MVP;
// the override is provided so a future EN audit screen can flip it without
// patching this component.

import * as React from 'react';

export interface PriceCellRONProps {
  /** Amount in cents (integer). Renders "—" if null/undefined/non-finite. */
  cents: number | null | undefined;
  /** BCP-47 locale, defaults to 'ro-RO'. */
  locale?: string;
  /** Show the "RON" suffix. Defaults to true. */
  withSuffix?: boolean;
  className?: string;
}

export function PriceCellRON({
  cents,
  locale = 'ro-RO',
  withSuffix = true,
  className,
}: PriceCellRONProps): JSX.Element {
  const value = typeof cents === 'number' && Number.isFinite(cents) ? cents / 100 : null;

  const text =
    value === null
      ? '—'
      : value.toLocaleString(locale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  return (
    <span className={['tabular-nums', className ?? ''].filter(Boolean).join(' ')}>
      {text}
      {withSuffix && value !== null ? <span className="ml-1 text-xs opacity-70">RON</span> : null}
    </span>
  );
}
