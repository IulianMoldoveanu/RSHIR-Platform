// B2B Marketplace — shared status badge for marketplace_offers.
//
// Stream 7/9 (shared UI). Mirrors ListingStatusBadge's API and palette
// discipline so the same status chip styling shows up wherever offers are
// listed (vendor listing detail drawer, fleet "Ofertele mele" panel).
//
// Color palette (per design plan):
//   PENDING   amber — submitted, awaiting vendor decision
//   ACCEPTED  green — vendor took this offer (writes to marketplace_matches)
//   REJECTED  red   — vendor picked someone else (or rejected explicitly)
//   EXPIRED   slate — past the offer's own expires_at, never accepted
//   WITHDRAWN slate — fleet pulled the offer back before acceptance

import * as React from 'react';

export type OfferStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'WITHDRAWN';

const OFFER_STATUS_STYLE: Record<OfferStatus, { label: string; cls: string }> = {
  PENDING: { label: 'În așteptare', cls: 'bg-amber-100 text-amber-800 ring-amber-200' },
  ACCEPTED: { label: 'Acceptată', cls: 'bg-green-100 text-green-800 ring-green-200' },
  REJECTED: { label: 'Respinsă', cls: 'bg-red-100 text-red-800 ring-red-200' },
  EXPIRED: { label: 'Expirată', cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
  WITHDRAWN: { label: 'Retrasă', cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
};

export interface OfferStatusBadgeProps {
  status: OfferStatus;
  className?: string;
}

export function OfferStatusBadge({ status, className }: OfferStatusBadgeProps): JSX.Element {
  const style = OFFER_STATUS_STYLE[status];
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
