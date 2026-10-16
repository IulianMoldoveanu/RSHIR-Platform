// B2B Marketplace (admin / light) — design-primitive barrel (spec §2).
//
// Single import surface for the marketplace pages:
//   import { PageHeader, Card, Button, ListingStatusBadge } from
//     '@/app/marketplace/_components/ui';
//
// Re-exports the NEW app-local primitives PLUS the EXISTING shared components
// from ../ (StatusBadges / PriceCellRON / ETAPill / EmptyMarketplaceState)
// so callers do a single import. The existing files are NOT moved or renamed.

// New primitives (this folder)
export { Icon } from './Icon';
export type { IconName, IconProps } from './Icon';

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

export { Button, ButtonLink, buttonClass } from './Button';
export type { ButtonProps, ButtonLinkProps, ButtonVariant, ButtonSize } from './Button';

export { FormField, INPUT_CLS, SELECT_CLS, TEXTAREA_CLS } from './FormField';
export type { FormFieldProps } from './FormField';

export { Skeleton, SkeletonCard } from './Skeleton';
export type { SkeletonProps, SkeletonCardProps } from './Skeleton';

export { ErrorState } from './ErrorState';
export type { ErrorStateProps } from './ErrorState';

// Existing shared components (re-export from ../ — single source of truth)
export { ListingStatusBadge } from '../ListingStatusBadge';
export type { ListingStatus, ListingStatusBadgeProps } from '../ListingStatusBadge';

export { OfferStatusBadge } from '../OfferStatusBadge';
export type { OfferStatus, OfferStatusBadgeProps } from '../OfferStatusBadge';

export { MatchStatusBadge } from '../MatchStatusBadge';
export type { MatchStatus, MatchStatusBadgeProps } from '../MatchStatusBadge';

export { PriceCellRON } from '../PriceCellRON';
export type { PriceCellRONProps } from '../PriceCellRON';

export { ETAPill } from '../ETAPill';
export type { ETAPillProps } from '../ETAPill';

export { EmptyMarketplaceState } from '../EmptyMarketplaceState';
export type { EmptyMarketplaceStateProps } from '../EmptyMarketplaceState';
