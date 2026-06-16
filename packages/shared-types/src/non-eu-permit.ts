/**
 * Non-EU work-permit verification contracts.
 *
 * Couriers whose nationality is outside the EU/EEA/CH set MUST hold a
 * valid Romanian work (or work+residence, or student-work) permit
 * before the platform may dispatch them. The verification flow
 * collects the document, redacts the permit number, and gates dispatch
 * via `fn_courier_has_valid_permit(courier_user_id)`.
 *
 * Schema correspondences (migration 20260616_016_courier_non_eu_permits.sql):
 *   - courier_profiles.nationality_iso       ←→ PermitCountryIso
 *   - courier_profiles.requires_work_permit  ←→ derived from nationality
 *   - courier_permits.*                      ←→ NonEUPermit
 *   - fn_courier_has_valid_permit(uuid)      ←→ CourierPermitCheckResult
 *
 * Pure types only.
 */

import type { IsoTimestamp, Uuid } from "./identity";

/**
 * ISO 3166-1 alpha-2 country code (uppercase). Used both for nationality
 * and for `issuingCountry`. The "must require permit" decision lives in
 * server-side config, not in this type.
 */
export type PermitCountryIso = string;

/** Permit category. */
export type PermitType = "WORK" | "RESIDENCE" | "STUDENT_WORK";

/** Permit verification lifecycle. */
export type PermitStatus = "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";

/**
 * NonEUPermit — a single work-permit document on file for a courier.
 *
 * `permitNumberRedacted` is e.g. `"RO-*****-2027"` — the platform NEVER
 * stores or returns the full permit number after the initial verify
 * step. `documentUrl` is a Supabase Storage path inside the private
 * `courier-permits` bucket (signed URL only — never public).
 */
export interface NonEUPermit {
  readonly id: Uuid;
  readonly courierUserId: Uuid;
  readonly permitType: PermitType;
  readonly permitNumberRedacted: string;
  readonly issuingCountry: PermitCountryIso;
  readonly issuedAt?: IsoTimestamp | null;
  readonly expiresAt: IsoTimestamp;
  readonly verificationStatus: PermitStatus;
  readonly documentUrl: string;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

/**
 * CourierPermitCheckResult — return shape of the
 * `fn_courier_has_valid_permit(p_user_id)` server-side helper. Apps
 * use this to gate dispatch / shift-start UX.
 *
 * `hasValidPermit` is true iff: a row exists with status=VERIFIED AND
 * `expiresAt > now()`. `expiresInDays` is non-null only when
 * `hasValidPermit` is true (warns the UI about upcoming expiry).
 */
export interface CourierPermitCheckResult {
  readonly courierUserId: Uuid;
  readonly hasValidPermit: boolean;
  readonly status?: PermitStatus | null;
  readonly expiresInDays?: number | null;
}
