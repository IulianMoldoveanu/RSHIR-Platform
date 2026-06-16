// B2B Marketplace — shared status badge for marketplace_matches.
//
// Stream 7/9 (shared UI). The match status is the post-acceptance lifecycle
// — by the time a row exists in marketplace_matches the offer was already
// ACCEPTED, so this badge tracks delivery progress (MATCHED → IN_PROGRESS →
// DELIVERED) plus the failure tail (CANCELLED, DISPUTED, REFUNDED).
//
// Color palette (per design plan, kept consistent with ListingStatusBadge):
//   MATCHED     amber  — accepted, pre-pickup
//   IN_PROGRESS purple — courier en route
//   DELIVERED   green  — successful drop-off
//   CANCELLED   slate  — terminated post-match without delivery
//   DISPUTED    red    — escalated to ops
//   REFUNDED    slate  — escrow released back to vendor (Faza 3 wiring)

import * as React from 'react';

export type MatchStatus =
  | 'MATCHED'
  | 'IN_PROGRESS'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'DISPUTED'
  | 'REFUNDED';

const MATCH_STATUS_STYLE: Record<MatchStatus, { label: string; cls: string }> = {
  MATCHED: { label: 'Atribuit', cls: 'bg-amber-100 text-amber-800 ring-amber-200' },
  IN_PROGRESS: { label: 'În livrare', cls: 'bg-purple-100 text-purple-800 ring-purple-200' },
  DELIVERED: { label: 'Livrat', cls: 'bg-green-100 text-green-800 ring-green-200' },
  CANCELLED: { label: 'Anulat', cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
  DISPUTED: { label: 'Dispută', cls: 'bg-red-100 text-red-800 ring-red-200' },
  REFUNDED: { label: 'Rambursat', cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
};

export interface MatchStatusBadgeProps {
  status: MatchStatus;
  className?: string;
}

export function MatchStatusBadge({ status, className }: MatchStatusBadgeProps): JSX.Element {
  const style = MATCH_STATUS_STYLE[status];
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
