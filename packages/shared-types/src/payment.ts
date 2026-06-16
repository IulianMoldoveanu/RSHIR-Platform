/**
 * Payment contracts for the 3-legs settlement model.
 *
 * Every consumer order on HIR splits into THREE financial legs:
 *
 *   1. CUSTOMER_TO_VENDOR — goods/service revenue (vendor's money)
 *   2. CUSTOMER_TO_FLEET  — delivery fee (fleet's money, paid to courier)
 *   3. CUSTOMER_TO_HIR    — data layer / platform fee (HIR's money)
 *
 * These legs may be collected in different forms (card via PSP, COD cash
 * handled by the courier, voucher, etc.) and at different times (immediate
 * authorization vs. capture on delivery vs. weekly batch). Keeping the legs
 * separate is the foundation of the HIR4You firewall: money never flows
 * through HIR for the vendor's revenue or the fleet's payout.
 *
 * Pure types only.
 */

import type { IsoTimestamp, Uuid } from "./identity";

/**
 * MoneyAmount — integer count of smallest currency unit (RON bani).
 *
 * Always store amounts as integer bani (1 RON = 100 bani). Never use float
 * math for money. Always pair with currency so cross-currency support is
 * trivial later.
 */
export interface MoneyAmount {
  readonly amountBani: number;
  readonly currency: "RON" | "EUR" | "USD";
}

/** Which actor receives this payment leg. */
export type PaymentLegBeneficiary = "VENDOR" | "FLEET" | "HIR";

/**
 * PaymentLeg kind — distinguishes the three economic flows of a single
 * consumer order. The same `orderId` will typically have one of each.
 */
export type PaymentLegKind =
  | "CUSTOMER_TO_VENDOR"
  | "CUSTOMER_TO_FLEET"
  | "CUSTOMER_TO_HIR";

/** How the leg is collected from the customer. */
export type PaymentMethod = "CARD" | "COD_CASH" | "COD_CARD" | "VOUCHER" | "WALLET";

/** Lifecycle of a single payment leg. */
export type PaymentStatus =
  | "PENDING"
  | "AUTHORIZED"
  | "CAPTURED"
  | "SETTLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "FAILED"
  | "CANCELLED"
  | "VOIDED";

/**
 * PaymentLeg — one of the three financial flows on a single order.
 *
 * `pspReference` is set whenever an external PSP processed the leg; for COD
 * legs it stays null and the leg moves PENDING → CAPTURED at courier "cash
 * collected" event.
 */
export interface PaymentLeg {
  readonly id: Uuid;
  readonly orderId: Uuid;
  readonly kind: PaymentLegKind;
  readonly beneficiary: PaymentLegBeneficiary;
  readonly method: PaymentMethod;
  readonly status: PaymentStatus;
  readonly amount: MoneyAmount;
  readonly pspProvider?: string | null;
  readonly pspReference?: string | null;
  readonly capturedAt?: IsoTimestamp | null;
  readonly settledAt?: IsoTimestamp | null;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

/**
 * PaymentSummary — convenience aggregate of all 3 legs for an order.
 * Every field is optional because a given order may not have all legs
 * (e.g., zero delivery fee for self-pickup → no CUSTOMER_TO_FLEET leg).
 */
export interface PaymentSummary {
  readonly orderId: Uuid;
  readonly toVendor?: PaymentLeg | null;
  readonly toFleet?: PaymentLeg | null;
  readonly toHir?: PaymentLeg | null;
}
