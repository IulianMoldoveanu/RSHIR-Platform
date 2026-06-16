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

// ─────────────────────────────────────────────────────────────────────────
// Server-action / edge-fn input + response shapes.
//
// These are the typed contracts the marketplace server actions and the
// three edge functions (marketplace-listing-create, marketplace-offer-submit,
// marketplace-match-accept) speak. Kept as pure types so apps, edge fns,
// and tests can share them.
// ─────────────────────────────────────────────────────────────────────────

/** Temperature class for a B2B listing parcel. */
export type ListingTemperature = "ambient" | "chilled" | "frozen";

/**
 * Address payload accepted by listing-create. Loose by design — the edge fn
 * accepts any of the four optional keys but rejects unknown keys and PII
 * (customer name/phone/email) inline.
 */
export interface ListingAddressPayload {
  readonly street?: string;
  readonly number?: string;
  readonly city?: string;
  readonly notes?: string;
}

/**
 * Payload posted from the vendor UI to marketplace-listing-create.
 *
 * Mirrors the FormData → typed payload shape built by createListingAction
 * (apps/restaurant-admin/src/app/marketplace/actions.ts).
 */
export interface ListingCreateInput {
  readonly vendor_tenant_id: Uuid;
  readonly vertical: Vertical;
  readonly city_id?: Uuid | null;
  readonly delivery_window_start: IsoTimestamp;
  readonly delivery_window_end: IsoTimestamp;
  readonly pickup_address: ListingAddressPayload;
  readonly dropoff_address: ListingAddressPayload;
  readonly package_description: string;
  readonly package_weight_grams?: number | null;
  readonly package_temperature?: ListingTemperature | null;
  /** Already redacted on the client (e.g. `+407*****89`). Never raw E.164. */
  readonly customer_phone_redacted?: string | null;
  readonly publish?: boolean;
}

/** Successful response from marketplace-listing-create. */
export interface ListingCreateResponse {
  readonly ok: true;
  readonly listing_id: Uuid;
  readonly expires_at: IsoTimestamp;
}

/**
 * Payload posted from the fleet UI to marketplace-offer-submit.
 *
 * Money is in integer cents to avoid float-RON math (matches the rest of
 * the 3-legs settlement model in payment.ts).
 */
export interface OfferSubmitInput {
  readonly listing_id: Uuid;
  readonly fleet_id: Uuid;
  readonly offered_price_cents: number;
  readonly eta_minutes: number;
  readonly expires_at: IsoTimestamp;
  readonly notes?: string | null;
}

/** Successful response from marketplace-offer-submit. */
export interface OfferSubmitResponse {
  readonly ok: true;
  readonly offer_id: Uuid;
  readonly status: MarketplaceOfferStatus; // 'PENDING'
}

/**
 * Payload posted from the vendor UI to marketplace-match-accept.
 *
 * `hir_fee_cents` is optional — server defaults to a platform-configured
 * fee when omitted. `final_price_cents` is the agreed price the vendor
 * commits to (typically `offer.offered_price_cents` but may be negotiated).
 */
export interface MatchAcceptInput {
  readonly offer_id: Uuid;
  readonly final_price_cents?: number;
  readonly hir_fee_cents?: number;
}

/** Successful response from marketplace-match-accept. */
export interface MatchAcceptResponse {
  readonly ok: true;
  readonly match_id: Uuid;
  readonly listing_id: Uuid;
  readonly offer_id: Uuid;
  readonly final_price_cents: number;
  readonly hir_fee_cents: number;
}

/**
 * Discriminated error envelope returned by all three marketplace edge fns
 * (HTTP 400/403/404/409/503 — see actions.ts describeEdgeError for the
 * vendor-facing translation table).
 */
export interface MarketplaceErrorResponse {
  readonly ok: false;
  readonly error: string;
}

/** Union return type the actions / edge fns can use. */
export type ListingCreateResult = ListingCreateResponse | MarketplaceErrorResponse;
export type OfferSubmitResult = OfferSubmitResponse | MarketplaceErrorResponse;
export type MatchAcceptResult = MatchAcceptResponse | MarketplaceErrorResponse;

// ─────────────────────────────────────────────────────────────────────────
// AI matching-engine surfaces (Stream 3).
//
// These are the typed input/output contracts the two AI edge functions
// speak:
//   - ai-marketplace-match-score   — scores an OFFER against its LISTING
//   - ai-marketplace-price-suggest — suggests a fair price range for a
//                                    listing about to be published
//
// The job rows live in `ai_jobs` with `job_type` in
// {'marketplace_match_score', 'marketplace_price_suggest'}.
// ─────────────────────────────────────────────────────────────────────────

/**
 * MatchScoreResult — per-offer score and factor breakdown produced by
 * `ai-marketplace-match-score`.
 *
 * `aiScore` is a 0..100 composite (higher is better) the vendor UI ranks
 * offers by. `factors` is the additive breakdown (each key in
 * [0, 1]) so the UI can show "why this fleet ranks higher".
 */
export interface MatchScoreResult {
  readonly offerId: Uuid;
  readonly listingId: Uuid;
  readonly aiScore: number;
  readonly factors: Readonly<Record<string, number>>;
  readonly modelVersion?: string | null;
  readonly computedAt: IsoTimestamp;
}

/**
 * PriceSuggestion — the suggested fair-price range for a new listing,
 * produced by `ai-marketplace-price-suggest` and surfaced inline as the
 * vendor fills the listing form.
 *
 * `lowRon` / `midRon` / `highRon` are integer RON (whole-RON granularity
 * is enough for vendor-facing UI; bani-level math is settlement's job).
 * `rationale` is a short human-readable explanation the UI displays as
 * a tooltip ("based on 12 similar deliveries in this city this week").
 */
export interface PriceSuggestion {
  readonly listingId?: Uuid | null;
  readonly cityId?: Uuid | null;
  readonly lowRon: number;
  readonly midRon: number;
  readonly highRon: number;
  readonly rationale: string;
  readonly modelVersion?: string | null;
  readonly computedAt: IsoTimestamp;
}
