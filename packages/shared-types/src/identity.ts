/**
 * Identity contracts shared across the HIR platform.
 *
 * These interfaces describe who the actors are (vendor tenants, fleets,
 * couriers) without binding to a specific Supabase row shape. Database row
 * types stay in `@hir/supabase-types`; these are the cross-app, cross-vertical
 * identity views consumed by marketplace + AI + Hepi orchestration code.
 *
 * Pure types only — no runtime, no Supabase imports, no DOM/Node.
 */

import type { Vertical } from "./multi-vendor";

/** ISO-8601 timestamp string (UTC). */
export type IsoTimestamp = string;

/** UUID string (lowercase canonical form). */
export type Uuid = string;

/** Slug used in storefront URLs. Lowercase, hyphen-separated. */
export type Slug = string;

/** Vendor tenant lifecycle stage. */
export type VendorTenantStatus =
  | "draft"
  | "onboarding"
  | "active"
  | "paused"
  | "suspended"
  | "archived";

/**
 * VendorTenant — a single vendor (restaurant, pharmacy, pet shop, etc.) on
 * the HIR platform. One vendor can sell in multiple verticals (rare, but
 * supported via `verticals`).
 */
export interface VendorTenant {
  readonly id: Uuid;
  readonly slug: Slug;
  readonly displayName: string;
  readonly legalName?: string | null;
  readonly cui?: string | null;
  readonly status: VendorTenantStatus;
  readonly primaryVertical: Vertical;
  readonly verticals: ReadonlyArray<Vertical>;
  readonly cityCode?: string | null;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

/** Fleet lifecycle stage. */
export type FleetStatus = "draft" | "active" | "paused" | "suspended" | "archived";

/**
 * FleetIdentity — a courier fleet (partner) operating within HIR. A fleet
 * owns a pool of couriers and selects which verticals/cities it serves.
 */
export interface FleetIdentity {
  readonly id: Uuid;
  readonly slug: Slug;
  readonly displayName: string;
  readonly legalName?: string | null;
  readonly cui?: string | null;
  readonly status: FleetStatus;
  readonly servesVerticals: ReadonlyArray<Vertical>;
  readonly servesCities: ReadonlyArray<string>;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

/** Courier work status (independent of OS/foreground state). */
export type CourierWorkStatus =
  | "offline"
  | "available"
  | "on_delivery"
  | "on_break"
  | "suspended";

/** Courier KYC verification stage. */
export type CourierKycStatus = "unverified" | "pending" | "verified" | "rejected";

/**
 * CourierIdentity — a single courier (PFA / employee of a fleet).
 *
 * `fleetId` MAY be null for orphaned couriers between fleet transfers;
 * callers should treat null as "not currently dispatchable".
 */
export interface CourierIdentity {
  readonly id: Uuid;
  readonly fleetId: Uuid | null;
  readonly displayName: string;
  readonly phoneE164?: string | null;
  readonly workStatus: CourierWorkStatus;
  readonly kycStatus: CourierKycStatus;
  readonly cityCode?: string | null;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}
