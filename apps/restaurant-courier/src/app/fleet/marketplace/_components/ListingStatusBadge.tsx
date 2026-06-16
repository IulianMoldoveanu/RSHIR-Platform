// B2B Marketplace — shared status badge for marketplace_listings.
//
// Stream 7/9 (shared UI), Strategy Master Plan Section 5. Extracted from the
// ad-hoc STATUS_BADGE map that lived inline in /marketplace/listings/page.tsx
// so the dashboard, listing detail, and admin console all stamp the same
// label + color for a given status.
//
// Color palette (per design plan):
//   DRAFT       zinc   — vendor not yet published
//   OPEN        blue   — accepting offers
//   MATCHED     amber  — accepted, pre-pickup
//   IN_PROGRESS purple — courier en route
//   COMPLETED   green  — delivered
//   CANCELLED   slate  — vendor cancelled pre-match
//   EXPIRED     slate  — window passed unmatched
//   DISPUTED    red    — under review
//
// Tailwind class names are themed via the `bg-X-100 text-X-800 ring-X-200`
// triplet which renders correctly on both the admin light surface and the
// courier dark surface (text-X-800 stays readable against either backdrop
// thanks to the X-100 fill).

import * as React from 'react';

export type ListingStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'MATCHED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'DISPUTED';

const LISTING_STATUS_STYLE: Record<ListingStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  OPEN: { label: 'Deschis', cls: 'bg-blue-100 text-blue-800 ring-blue-200' },
  MATCHED: { label: 'Atribuit', cls: 'bg-amber-100 text-amber-800 ring-amber-200' },
  IN_PROGRESS: { label: 'În livrare', cls: 'bg-purple-100 text-purple-800 ring-purple-200' },
  COMPLETED: { label: 'Livrat', cls: 'bg-green-100 text-green-800 ring-green-200' },
  CANCELLED: { label: 'Anulat', cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
  EXPIRED: { label: 'Expirat', cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
  DISPUTED: { label: 'Dispută', cls: 'bg-red-100 text-red-800 ring-red-200' },
};

export interface ListingStatusBadgeProps {
  status: ListingStatus;
  className?: string;
}

export function ListingStatusBadge({ status, className }: ListingStatusBadgeProps): JSX.Element {
  const style = LISTING_STATUS_STYLE[status];
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        style.cls,
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {style.label}
    </span>
  );
}
