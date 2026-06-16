// Stream UI-3 — Rating + Job board (Open Marketplace Extensions).
//
// RatingTierBadge — public-safe tier band shown to fleet managers and (later)
// surfaced cross-fleet to vendors. Mirrors the server-side `fn_fleet_tier`
// SQL function from migration 20260616_012_rating_dual_axis.sql so the
// colour/label here matches what the SECDEF returns to the rest of the
// platform.
//
// Per the board verdict (Open Marketplace Extensions §11.1):
//   "Gold/Silver/Bronze visible public, NOT numeric directly".
// → The badge is ONLY ever the tier band. Raw numeric `avg_rating` is
//   reserved for the fleet owner's private dashboard (see
//   `<DriverScoreCard />` consumers).
//
// Tier mapping (must stay in sync with fn_fleet_tier):
//   Gold       avg_rating >= 4.50
//   Silver     avg_rating >= 4.00
//   Bronze     avg_rating >= 3.50
//   Probation  avg_rating < 3.50   (visible WARNING band)
//   Unrated    avg_rating IS NULL  (no matches yet)
//
// We keep the colour triplet as `bg-X-100 text-X-800 ring-X-200` to render
// readably on both the courier dark surface and the admin light surface,
// matching the existing marketplace badges (ListingStatusBadge etc).

import * as React from 'react';

export type FleetTier = 'Gold' | 'Silver' | 'Bronze' | 'Probation' | 'Unrated';

const TIER_STYLE: Record<FleetTier, { label: string; cls: string }> = {
  Gold: {
    label: 'Gold',
    cls: 'bg-amber-100 text-amber-800 ring-amber-200',
  },
  Silver: {
    label: 'Silver',
    cls: 'bg-slate-100 text-slate-800 ring-slate-300',
  },
  Bronze: {
    label: 'Bronze',
    cls: 'bg-orange-100 text-orange-800 ring-orange-200',
  },
  Probation: {
    label: 'Probă',
    cls: 'bg-rose-100 text-rose-800 ring-rose-200',
  },
  Unrated: {
    label: 'Nou',
    cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  },
};

export interface RatingTierBadgeProps {
  tier: FleetTier;
  className?: string;
}

export function RatingTierBadge({ tier, className }: RatingTierBadgeProps): JSX.Element {
  const style = TIER_STYLE[tier];
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        style.cls,
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`Tier ${style.label}`}
    >
      {style.label}
    </span>
  );
}

/**
 * Map a numeric avg_rating into the tier label. Keep in sync with the
 * SQL helper `fn_fleet_tier(p_fleet_id)` from migration 20260616_012.
 *
 * Returns 'Unrated' when avg is null/undefined OR the rating window has
 * fewer than `minMatches` matches (the SQL helper doesn't gate by match
 * count, but UI callers SHOULD so we don't badge a Gold fleet off a
 * single 5-star rating).
 */
export function tierFromAvgRating(
  avg: number | null | undefined,
  matchCount: number = 0,
  minMatches: number = 5,
): FleetTier {
  if (avg == null || !Number.isFinite(avg)) return 'Unrated';
  if (matchCount < minMatches) return 'Unrated';
  if (avg >= 4.5) return 'Gold';
  if (avg >= 4.0) return 'Silver';
  if (avg >= 3.5) return 'Bronze';
  return 'Probation';
}
