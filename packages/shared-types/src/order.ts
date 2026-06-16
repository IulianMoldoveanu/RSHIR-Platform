/**
 * Unified order contract across verticals (restaurant, pharmacy, …) and
 * across origin sources (HIR storefront, WooCommerce inbound, marketplace,
 * tablet-walk-in, etc.).
 *
 * The order model in the database is rich and vertical-specific. This file
 * defines the SHARED VIEW that cross-vertical consumers (courier dispatch,
 * Hepi, marketplace, analytics) rely on. Vertical-specific fields live in
 * an opaque `verticalPayload` carried as-is.
 *
 * Pure types only.
 */

import type { IsoTimestamp, Uuid } from "./identity";
import type { MoneyAmount } from "./payment";
import type { Vertical } from "./multi-vendor";

/** Where the order entered the platform. */
export type OrderSource =
  | "HIR_STOREFRONT"
  | "HIR4YOU"
  | "WOOCOMMERCE_INBOUND"
  | "MARKETPLACE"
  | "TABLET_WALKIN"
  | "PHONE"
  | "PARTNER_API"
  | "OTHER";

/**
 * Order lifecycle states — superset that every vertical maps into. Vertical
 * adapters MAY add their own internal sub-states but MUST funnel into one
 * of these for the cross-vertical view.
 */
export type OrderStatus =
  | "DRAFT"
  | "PLACED"
  | "ACCEPTED"
  | "PREPARING"
  | "READY"
  | "DISPATCHED"
  | "PICKED_UP"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED";

/** Fulfillment channel for the order. */
export type FulfillmentMode = "DELIVERY" | "PICKUP" | "DINE_IN" | "CLICK_AND_COLLECT";

/** Single line on the order. Prices are integer bani; vendor catalog is SoR. */
export interface UnifiedOrderLine {
  readonly id: Uuid;
  readonly sku?: string | null;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: MoneyAmount;
  readonly lineTotal: MoneyAmount;
  readonly requiresPrescription?: boolean;
  readonly notes?: string | null;
}

/** Address used for delivery. Coords optional for pickup-only orders. */
export interface OrderAddress {
  readonly line1: string;
  readonly line2?: string | null;
  readonly city: string;
  readonly postalCode?: string | null;
  readonly countryCode: string;
  readonly lat?: number | null;
  readonly lon?: number | null;
  readonly notes?: string | null;
}

/** Customer snapshot — never JOIN to a live customer in cross-vertical view. */
export interface OrderCustomerSnapshot {
  readonly displayName: string;
  readonly phoneE164?: string | null;
  readonly email?: string | null;
}

/**
 * UnifiedOrder — the cross-vertical normalized order shape.
 *
 * `verticalPayload` is an opaque escape hatch for vertical-specific fields
 * (e.g., pharma prescription details, restaurant cook instructions). Consumers
 * that don't understand a vertical MUST NOT crash on unknown keys.
 */
export interface UnifiedOrder {
  readonly id: Uuid;
  readonly publicCode: string;
  readonly vendorTenantId: Uuid;
  readonly vertical: Vertical;
  readonly source: OrderSource;
  readonly status: OrderStatus;
  readonly fulfillmentMode: FulfillmentMode;
  readonly cityCode?: string | null;
  readonly customer: OrderCustomerSnapshot;
  readonly deliveryAddress?: OrderAddress | null;
  readonly lines: ReadonlyArray<UnifiedOrderLine>;
  readonly subtotal: MoneyAmount;
  readonly deliveryFee?: MoneyAmount | null;
  readonly platformFee?: MoneyAmount | null;
  readonly total: MoneyAmount;
  readonly placedAt: IsoTimestamp;
  readonly readyAt?: IsoTimestamp | null;
  readonly pickedUpAt?: IsoTimestamp | null;
  readonly deliveredAt?: IsoTimestamp | null;
  readonly cancelledAt?: IsoTimestamp | null;
  readonly assignedCourierId?: Uuid | null;
  readonly assignedFleetId?: Uuid | null;
  readonly verticalPayload?: Readonly<Record<string, unknown>> | null;
}

/** Terminal states — order will not transition further. */
export type TerminalOrderStatus = "DELIVERED" | "FAILED" | "CANCELLED" | "REFUNDED";
