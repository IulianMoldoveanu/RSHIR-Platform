// Pure helpers/types extracted from actions.ts so the 'use server' file only
// exports async functions (Next 14 server-actions constraint).

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'DISPATCHED'
  | 'IN_DELIVERY'
  | 'DELIVERED'
  | 'PICKED_UP'
  | 'NO_SHOW'
  | 'CANCELLED';

// Hard-coded forward path. Each key lists the statuses that may follow it.
// CANCELLED is allowed from any non-terminal state (handled separately in
// `cancelOrder`); DELIVERED, PICKED_UP, NO_SHOW, and CANCELLED are terminal.
//
// READY branches two ways depending on fulfillment (there's no fulfillment
// column here -- this machine stays agnostic of it, same as every other
// status). DISPATCHED/IN_DELIVERY/DELIVERED are the courier-delivery path;
// PICKED_UP/NO_SHOW are the customer-pickup path. Callers filter
// nextStatuses() down to the branch that applies to a given order (see
// dashboard/orders/[id]/page.tsx's isPickup filtering) so the UI never
// offers "Trimite" on a pickup order or "Comandă ridicată" on a delivery one.
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['PREPARING', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['DISPATCHED', 'PICKED_UP', 'NO_SHOW', 'CANCELLED'],
  DISPATCHED: ['IN_DELIVERY', 'CANCELLED'],
  IN_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  PICKED_UP: [],
  NO_SHOW: [],
  CANCELLED: [],
};

export class OrderTransitionError extends Error {
  constructor(
    message: string,
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
  ) {
    super(message);
    this.name = 'OrderTransitionError';
  }
}

export function nextStatuses(current: OrderStatus): OrderStatus[] {
  return ALLOWED_TRANSITIONS[current] ?? [];
}
