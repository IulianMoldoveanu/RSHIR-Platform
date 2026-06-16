/**
 * Courier job board contracts.
 *
 * Fleets publish job listings (open courier slots) and couriers apply.
 * The flow is intentionally separate from marketplace listings (which
 * are per-delivery jobs vendors post for fleets) — different actors,
 * different lifecycles, different RLS.
 *
 * Schema correspondences (migration 20260616_014_courier_job_board.sql):
 *   - courier_job_listings.*                ←→ CourierJobListing
 *   - courier_applications.*                ←→ CourierJobApplication
 *
 * Pure types only.
 */

import type { IsoTimestamp, Uuid } from "./identity";

/**
 * Employment shape a fleet is offering.
 *
 *   - PFA              — fleet expects an authorised PFA contractor
 *   - EMPLOYEE         — fleet employs the courier directly (CIM)
 *   - PFA_OR_EMPLOYEE  — either is fine; fleet decides at hire
 */
export type EmploymentType = "PFA" | "EMPLOYEE" | "PFA_OR_EMPLOYEE";

/** Payout model advertised in the listing. */
export type JobPayoutModel =
  | "PER_DELIVERY"
  | "HOURLY"
  | "MONTHLY_SALARY"
  | "HYBRID";

/** Lifecycle of a published job listing. */
export type CourierJobListingStatus = "OPEN" | "PAUSED" | "CLOSED";

/** Lifecycle of a courier's application to a listing. */
export type CourierJobApplicationStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "WITHDRAWN";

/**
 * CourierJobListing — a single open courier slot a fleet has published.
 *
 * `cityId` is required (job board is city-scoped); `expiresAt` is the
 * auto-close timestamp (server enforces; nullable means no auto-close).
 */
export interface CourierJobListing {
  readonly id: Uuid;
  readonly fleetId: Uuid;
  readonly cityId: Uuid;
  readonly title: string;
  readonly description: string;
  readonly employmentType: EmploymentType;
  readonly payoutModel: JobPayoutModel;
  readonly status: CourierJobListingStatus;
  readonly expiresAt?: IsoTimestamp | null;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

/**
 * CourierJobApplication — one courier's application to one listing.
 *
 * UNIQUE (listingId, courierUserId) is enforced in the DB: a courier
 * cannot apply twice to the same listing.
 */
export interface CourierJobApplication {
  readonly id: Uuid;
  readonly listingId: Uuid;
  readonly courierUserId: Uuid;
  readonly status: CourierJobApplicationStatus;
  readonly coverNote?: string | null;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}
