/**
 * Canonical RO labels + pill colour palette for the restaurant_orders state
 * machine (the tenant-side state, separate from courier_orders covered in
 * ./courier-status.ts).
 *
 * Palette principle (UX 2026-05-26):
 *   - PREPARING / READY use AMBER everywhere — "kitchen warmth" signal.
 *     Pre-this consolidation, admin used purple here; web used amber. Web's
 *     palette communicated kitchen activity more intuitively, so admin
 *     migrated to match.
 *   - PENDING uses AMBER in operator-facing surfaces (admin), ZINC in
 *     customer-facing surfaces (web /track). Intentional context split:
 *     for the operator PENDING means "act now"; for the customer it means
 *     "received, waiting for confirmation". Both render via this module —
 *     pass the `audience` arg.
 *   - CONFIRMED / DISPATCHED / IN_DELIVERY: PURPLE — in pipeline, on track.
 *   - DELIVERED: EMERALD. CANCELLED: ROSE. Universal terminals.
 */

export type RestaurantOrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'DISPATCHED'
  | 'IN_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

export const RESTAURANT_ORDER_STATUS_LABEL_RO: Record<RestaurantOrderStatus, string> = {
  PENDING: 'În așteptare',
  CONFIRMED: 'Confirmată',
  PREPARING: 'În pregătire',
  READY: 'Gata',
  DISPATCHED: 'Trimisă',
  IN_DELIVERY: 'În livrare',
  DELIVERED: 'Livrată',
  CANCELLED: 'Anulată',
};

type PillClasses = string;
type Audience = 'operator' | 'customer';

const OPERATOR_PALETTE: Record<RestaurantOrderStatus, PillClasses> = {
  PENDING: 'bg-amber-100 text-amber-800 ring-amber-200',
  CONFIRMED: 'bg-purple-100 text-purple-800 ring-purple-200',
  PREPARING: 'bg-amber-100 text-amber-800 ring-amber-200',
  READY: 'bg-amber-100 text-amber-800 ring-amber-200',
  DISPATCHED: 'bg-purple-100 text-purple-800 ring-purple-200',
  IN_DELIVERY: 'bg-purple-100 text-purple-800 ring-purple-200',
  DELIVERED: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  CANCELLED: 'bg-rose-100 text-rose-800 ring-rose-200',
};

const CUSTOMER_PALETTE: Record<RestaurantOrderStatus, PillClasses> = {
  ...OPERATOR_PALETTE,
  PENDING: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
};

/**
 * Pill tailwind classes for a status. `audience='operator'` returns the
 * dashboard palette (amber PENDING); `audience='customer'` returns the
 * track palette (zinc PENDING). Use ring-1 ring-inset to render.
 */
export function statusPillClasses(
  status: string,
  audience: Audience = 'operator',
): PillClasses {
  const palette = audience === 'customer' ? CUSTOMER_PALETTE : OPERATOR_PALETTE;
  return (
    palette[status as RestaurantOrderStatus] ?? 'bg-zinc-100 text-zinc-700 ring-zinc-200'
  );
}
