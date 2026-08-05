/**
 * When a `restaurant_orders` realtime event should be announced to the
 * kitchen (chime + desktop notification + title flash).
 *
 * The subtlety is card orders. The storefront inserts the order PENDING/UNPAID
 * and only *then* redirects the customer to the PSP's hosted page, so the
 * INSERT event fires while the customer is still looking at a card form they
 * may never submit — the kitchen was being called to orders that were one
 * abandoned checkout away from never existing. The money lands later, when the
 * PSP webhook flips the order to PAID + CONFIRMED (`markOrderPaidAndDispatch`
 * in restaurant-web's order-finalize.ts). That flip is the real order.
 *
 * Cash on delivery has no such moment: a COD order is UNPAID by design until
 * the courier hands it over, so its INSERT *is* the real order and must ring
 * immediately.
 */

export type OrderAnnounceRow = {
  status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
};

/** A card order whose payment has not landed yet. */
export function isAwaitingCardPayment(row: OrderAnnounceRow): boolean {
  return row.payment_method === 'CARD' && row.payment_status !== 'PAID';
}

/**
 * Ring on INSERT for everything except a card order still awaiting payment.
 *
 * Deliberately positive about CARD only: `payment_method` carries a DEFAULT
 * of 'CARD' in the DB and the checkout route sets it explicitly for COD, so an
 * absent value means an old or unexpected row. Those ring — a premature chime
 * is a nuisance, a missed order is a lost customer.
 */
export function announceOnInsert(row: OrderAnnounceRow): boolean {
  return !isAwaitingCardPayment(row);
}

/**
 * Ring on UPDATE only for the card payment actually landing: a card order
 * crossing into PAID while still CONFIRMED — the state
 * `markOrderPaidAndDispatch` writes, and the moment the order becomes real.
 *
 * All three guards earn their place:
 *  - CARD, because a COD order reaching PAID is a delivery being settled or an
 *    operator reconciling cash, not a new order; the kitchen saw it at INSERT.
 *  - the transition, because a tab that subscribed *after* the payment landed
 *    would otherwise treat any later update to a still-CONFIRMED order as an
 *    arrival (Codex P2, #1062). `restaurant_orders` is REPLICA IDENTITY FULL
 *    and in the realtime publication, so the previous row really is available.
 *  - CONFIRMED, because past that point the kitchen has already accepted it.
 *
 * When `previous` is absent we ring: a missing old record should degrade to
 * the old, noisier behaviour rather than to silence. Callers still
 * de-duplicate by order id.
 */
export function announceOnUpdate(
  next: OrderAnnounceRow,
  previous?: OrderAnnounceRow,
): boolean {
  if (next.payment_method !== 'CARD') return false;
  if (next.payment_status !== 'PAID' || next.status !== 'CONFIRMED') return false;
  return previous?.payment_status !== 'PAID';
}
