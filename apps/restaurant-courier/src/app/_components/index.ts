// Stream UI-3 — Rating + Job board (Open Marketplace Extensions).
//
// App-root shared UI primitives. Lives at `src/app/_components/` so the
// `_` prefix tells Next's app router this is NOT a route segment, while
// keeping the imports short (`@/app/_components`) across dashboard + fleet
// pages.

export { RatingTierBadge, tierFromAvgRating } from './RatingTierBadge';
export type { FleetTier, RatingTierBadgeProps } from './RatingTierBadge';

export { DriverScoreCard } from './DriverScoreCard';
export type { DriverScoreBreakdown, DriverScoreCardProps } from './DriverScoreCard';

export {
  JobStatusBadge,
  APPLICATION_KANBAN_ORDER,
} from './JobStatusBadge';
export type {
  CourierJobListingStatus,
  CourierJobApplicationStatus,
  JobStatusValue,
  JobStatusBadgeProps,
} from './JobStatusBadge';
