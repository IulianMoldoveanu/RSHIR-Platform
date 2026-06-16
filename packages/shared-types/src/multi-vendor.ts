/**
 * Multi-vendor vertical taxonomy.
 *
 * HIR is a multi-vertical platform: restaurants, pharmacies, pet shops,
 * minimarkets, etc. all share one courier pool and one settlement layer.
 * The `Vertical` union is the canonical discriminator used in:
 *   - storefronts & catalogs
 *   - courier dispatch (filter by what a fleet serves)
 *   - analytics (funnel per vertical)
 *   - marketplace listings
 *
 * Add new verticals here; do not invent strings ad-hoc in apps.
 */

export type Vertical =
  | "RESTAURANT"
  | "PHARMACY"
  | "PET"
  | "VET"
  | "MINIMARKET"
  | "FITO"
  | "RETAIL"
  | "OTHER";

/** Verticals that are currently consumer-facing (storefront live). */
export const CONSUMER_FACING_VERTICALS: ReadonlyArray<Vertical> = [
  "RESTAURANT",
  "PHARMACY",
  "PET",
  "MINIMARKET",
] as const;

/** Verticals subject to prescription / Rx legal flow. */
export const RX_VERTICALS: ReadonlyArray<Vertical> = ["PHARMACY", "VET"] as const;

/** Type guard for a candidate string value. */
export function isVertical(value: unknown): value is Vertical {
  return (
    typeof value === "string" &&
    (value === "RESTAURANT" ||
      value === "PHARMACY" ||
      value === "PET" ||
      value === "VET" ||
      value === "MINIMARKET" ||
      value === "FITO" ||
      value === "RETAIL" ||
      value === "OTHER")
  );
}

/** Whether a vertical may carry Rx-gated items. */
export function isRxVertical(v: Vertical): boolean {
  return v === "PHARMACY" || v === "VET";
}
