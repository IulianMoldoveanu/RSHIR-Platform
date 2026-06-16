/**
 * Vendor subscription tier contracts.
 *
 * HIR offers two onboarding tracks for vendors:
 *
 *   - FULL    — the legacy "PRO" tenant: ops-onboarded, full SaaS or
 *               headless mode, full feature set.
 *   - CASUAL  — self-serve signup, lightweight feature set, designed for
 *               long-tail vendors (small pet shops, single-location
 *               minimarkets) who outgrow the platform later into FULL.
 *
 * On top of that, paying vendors subscribe to a tier (STARTER / PRO /
 * ENTERPRISE) priced in monthly RON; the catalog of tiers lives in
 * `subscription_plans`, and a vendor's active subscription lives in
 * `vendor_subscriptions`.
 *
 * Schema correspondences:
 *   - tenants.kind                          ←→ TenantKind
 *   - tenants.subscription_plan_code        ←→ TenantSubscription.planCode
 *   - tenants.subscription_status           ←→ TenantSubscription.status
 *   - subscription_plans.code/...           ←→ SubscriptionPlan
 *   - vendor_subscriptions.*                ←→ TenantSubscription
 *
 * Pure types only.
 */

import type { IsoTimestamp, Uuid } from "./identity";

/** Onboarding track of a tenant. */
export type TenantKind = "FULL" | "CASUAL";

/** Tier code published in `subscription_plans.code`. */
export type SubscriptionTierCode = "STARTER" | "PRO" | "ENTERPRISE";

/** Lifecycle of a single tenant's subscription. */
export type SubscriptionStatus =
  | "TRIAL"
  | "ACTIVE"
  | "PAUSED"
  | "CANCELLED"
  | "EXPIRED";

/**
 * SubscriptionPlan — a single row of the public tier catalog.
 *
 * `features` is an opaque JSON blob — apps SHOULD treat it as a
 * `Record<string, unknown>` and validate keys at the boundary they care
 * about. Concrete feature keys live next to their consumers (e.g. the
 * marketplace app reads `features.marketplace.listings_per_month`).
 *
 * `monthlyPriceRon` is the human-readable RON figure (e.g. 199 for the
 * STARTER tier). Bani-level math should join through `pricing_zones` /
 * settlement, not this surface.
 */
export interface SubscriptionPlan {
  readonly code: SubscriptionTierCode;
  readonly displayName: string;
  readonly monthlyPriceRon: number;
  readonly features: Readonly<Record<string, unknown>>;
  readonly isActive: boolean;
  readonly createdAt: IsoTimestamp;
}

/**
 * TenantSubscription — a single tenant's active (or recently-active)
 * subscription row.
 *
 * `activeUntil` is the end of the current billing period; the next
 * renewal MAY happen after that timestamp depending on payment success.
 */
export interface TenantSubscription {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly planCode: SubscriptionTierCode;
  readonly status: SubscriptionStatus;
  readonly currentPeriodStart: IsoTimestamp;
  readonly activeUntil: IsoTimestamp;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}
