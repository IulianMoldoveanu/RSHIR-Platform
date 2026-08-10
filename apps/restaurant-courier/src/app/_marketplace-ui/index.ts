// B2B Marketplace (courier dark theme) — shared UI primitive barrel.
//
// One import surface for the courier marketplace pages:
//   import { PageHeader, Card, StatCard, VerticalBadge, RouteSteps,
//            Button, buttonClass, Skeleton, SkeletonCard, ErrorState,
//            // re-exported from fleet/marketplace/_components:
//            ListingStatusBadge, OfferStatusBadge, MatchStatusBadge,
//            PriceCellRON, ETAPill, EmptyMarketplaceState } from '@/app/_marketplace-ui';
//
// Courier keeps lucide-react for page-level icons (no admin Icon module);
// lucide is stroke/currentColor and satisfies the icon rule. The local
// primitives use an internal inline-SVG set (_icons) so they are
// self-contained.

// New courier dark primitives.
export { PageHeader } from './PageHeader';
export type { PageHeaderProps } from './PageHeader';

export { Card } from './Card';
export type { CardProps } from './Card';

export { StatCard } from './StatCard';
export type { StatCardProps, StatCardDelta } from './StatCard';

export { VerticalBadge } from './VerticalBadge';
export type { VerticalBadgeProps } from './VerticalBadge';

export { RouteSteps } from './RouteSteps';
export type { RouteStepsProps } from './RouteSteps';

export { Button, buttonClass } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { Skeleton, SkeletonCard } from './Skeleton';
export type { SkeletonProps, SkeletonCardProps } from './Skeleton';

export { ErrorState } from './ErrorState';
export type { ErrorStateProps } from './ErrorState';

// Re-export the existing shared marketplace components (unchanged, kept in
// fleet/marketplace/_components) for one-import ergonomics.
export {
  ListingStatusBadge,
  OfferStatusBadge,
  MatchStatusBadge,
  PriceCellRON,
  ETAPill,
  EmptyMarketplaceState,
} from '../fleet/marketplace/_components';
export type {
  ListingStatus,
  ListingStatusBadgeProps,
  OfferStatus,
  OfferStatusBadgeProps,
  MatchStatus,
  MatchStatusBadgeProps,
  PriceCellRONProps,
  ETAPillProps,
  EmptyMarketplaceStateProps,
} from '../fleet/marketplace/_components';
