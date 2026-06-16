/**
 * Dual-axis marketplace rating contracts.
 *
 * The legacy `delivery_ratings` table holds one axis — customer →
 * courier — and is preserved as-is. The marketplace adds two more axes:
 *
 *   - vendor   → fleet  (1..5 stars, post-match)
 *   - vendor   → fleet  (NPS, 0..10, post-match cohort survey)
 *
 * Aggregates flow into `fleet_aggregate_scores`, which the AI matching
 * engine reads to weight offer-scoring (Stream 3) and the marketplace UI
 * reads to badge top-tier fleets.
 *
 * Schema correspondences (migration 20260616_013_marketplace_rating_dual_axis.sql):
 *   - delivery_ratings.axis                 ←→ RatingAxis
 *   - vendor_to_fleet_ratings.*             ←→ VendorToFleetRating
 *   - vendor_nps_ratings.*                  ←→ VendorNpsRating
 *   - fleet_aggregate_scores.*              ←→ FleetAggregateScore
 *
 * Pure types only.
 */

import type { IsoTimestamp, Uuid } from "./identity";

/** Which directed relation a single rating row represents. */
export type RatingAxis =
  | "customer_to_courier"
  | "vendor_to_fleet"
  | "vendor_nps";

/**
 * Tier bucket the fleet's aggregate score maps into. UI surfaces use this
 * for badging ("Gold fleet", "Silver fleet") — thresholds live in
 * server-side config, not in client code.
 */
export type FleetScoreTier = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";

/**
 * VendorToFleetRating — a single 1..5 stars rating left by a vendor for
 * a fleet after a completed marketplace match.
 *
 * `tags` is a free-form short-token array (e.g. `["on_time", "polite",
 * "careful_with_box"]`) so analytics can mine reasons without parsing
 * free text. `comment` is optional long-form feedback.
 */
export interface VendorToFleetRating {
  readonly id: Uuid;
  readonly matchId: Uuid;
  readonly vendorTenantId: Uuid;
  readonly fleetId: Uuid;
  readonly stars: 1 | 2 | 3 | 4 | 5;
  readonly tags: ReadonlyArray<string>;
  readonly comment?: string | null;
  readonly createdAt: IsoTimestamp;
}

/**
 * VendorNpsRating — a single Net Promoter Score response from a vendor
 * about a fleet they've used at least once. 0..10 scale.
 */
export interface VendorNpsRating {
  readonly id: Uuid;
  readonly vendorTenantId: Uuid;
  readonly fleetId: Uuid;
  readonly nps: number;
  readonly createdAt: IsoTimestamp;
}

/**
 * DriverScore — a per-courier score breakdown surfaced to fleets and
 * (selectively) to the AI matching engine.
 *
 * `breakdown` is the additive factor map (e.g. `{ on_time: 0.92,
 * acceptance_rate: 0.81, customer_stars: 0.95 }`); `score` is the
 * weighted composite in [0, 100].
 */
export interface DriverScore {
  readonly courierUserId: Uuid;
  readonly fleetId: Uuid;
  readonly score: number;
  readonly breakdown: Readonly<Record<string, number>>;
  readonly lastRecomputedAt: IsoTimestamp;
}

/**
 * FleetAggregateScore — materialised cache row recomputed on every
 * rating insert. The marketplace AI and fleet-comparison UI read this
 * row instead of re-aggregating on every page load.
 *
 * `tier` is derived server-side from `avgCustomerStars` +
 * `avgVendorStars` + `nps` + `matchCount`. Clients SHOULD trust the
 * stored value (single source of truth).
 */
export interface FleetAggregateScore {
  readonly fleetId: Uuid;
  readonly avgCustomerStars: number;
  readonly avgVendorStars: number;
  readonly nps: number;
  readonly matchCount: number;
  readonly tier: FleetScoreTier;
  readonly lastRecomputedAt: IsoTimestamp;
}
