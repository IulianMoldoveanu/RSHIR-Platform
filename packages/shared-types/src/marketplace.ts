/**
 * Marketplace contracts.
 *
 * The HIR marketplace lets fleets bid on / claim delivery jobs published by
 * vendor tenants. Three core entities:
 *
 *   - MarketplaceListing — a job published by a vendor (an order seeking a fleet)
 *   - MarketplaceOffer   — a bid placed by a fleet on a listing
 *   - MarketplaceMatch   — the accepted (vendor, fleet) pairing
 *
 * Pure types only. No assumptions about transport (REST / realtime / queue).
 */

import type { IsoTimestamp, Uuid } from "./identity";
import type { MoneyAmount } from "./payment";
import type { Vertical } from "./multi-vendor";

/** Status of a published listing. */
export type MarketplaceListingStatus =
  | "OPEN"
  | "MATCHED"
  | "EXPIRED"
  | "CANCELLED"
  | "WITHDRAWN";

/**
 * MarketplaceListing — a job the vendor wants delivered, posted to the open
 * fleet pool. `targetFleetIds`, if non-null, restricts visibility to a private
 * subset of fleets (allow-list semantics).
 */
export interface MarketplaceListing {
  readonly id: Uuid;
  readonly orderId: Uuid;
  readonly vendorTenantId: Uuid;
  readonly vertical: Vertical;
  readonly cityCode?: string | null;
  readonly status: MarketplaceListingStatus;
  readonly suggestedFee?: MoneyAmount | null;
  readonly publishedAt: IsoTimestamp;
  readonly expiresAt?: IsoTimestamp | null;
  readonly targetFleetIds?: ReadonlyArray<Uuid> | null;
  readonly notes?: string | null;
}

/** Status of a single fleet's bid. */
export type MarketplaceOfferStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "WITHDRAWN"
  | "EXPIRED";

/**
 * MarketplaceOffer — a fleet's bid on a listing. Multiple offers may exist
 * per listing; at most one transitions to ACCEPTED.
 */
export interface MarketplaceOffer {
  readonly id: Uuid;
  readonly listingId: Uuid;
  readonly fleetId: Uuid;
  readonly status: MarketplaceOfferStatus;
  readonly proposedFee: MoneyAmount;
  readonly etaMinutes?: number | null;
  readonly createdAt: IsoTimestamp;
  readonly decidedAt?: IsoTimestamp | null;
  readonly expiresAt?: IsoTimestamp | null;
  readonly notes?: string | null;
}

/**
 * MarketplaceMatch — the accepted pairing for a listing. Immutable once
 * created; cancellations flip the underlying listing/offer status, but the
 * Match row remains for audit + settlement.
 */
export interface MarketplaceMatch {
  readonly id: Uuid;
  readonly listingId: Uuid;
  readonly offerId: Uuid;
  readonly fleetId: Uuid;
  readonly agreedFee: MoneyAmount;
  readonly matchedAt: IsoTimestamp;
}
