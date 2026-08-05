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
 * Ring on UPDATE only at the payment-confirmation moment: PAID *while still*
 * CONFIRMED. The status guard is what keeps COD quiet — a COD order also
 * reaches PAID, but at DELIVERED, hours after the kitchen already saw it.
 *
 * Callers must still de-duplicate by order id: an order can receive further
 * updates while it sits in CONFIRMED waiting for the kitchen to accept it.
 */
export function announceOnUpdate(row: OrderAnnounceRow): boolean {
  return row.payment_status === 'PAID' && row.status === 'CONFIRMED';
}
