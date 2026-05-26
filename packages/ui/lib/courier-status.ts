/**
 * Shared RO labels for the courier_orders state machine.
 *
 * Single source of truth — was duplicated across restaurant-admin's
 * courier-mini-map.tsx and restaurant-web's track surfaces.
 */

export type CourierOrderStatus =
  | 'CREATED'
  | 'OFFERED'
  | 'ACCEPTED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED';

export const COURIER_STATUS_LABEL_RO: Record<CourierOrderStatus, string> = {
  CREATED: 'Comandă transmisă',
  OFFERED: 'Oferită curierilor',
  ACCEPTED: 'Curier alocat',
  PICKED_UP: 'A ridicat mâncarea',
  IN_TRANSIT: 'În drum spre client',
  DELIVERED: 'Livrată',
  CANCELLED: 'Anulată',
};

export const COURIER_STATUS_STEPS: readonly CourierOrderStatus[] = [
  'CREATED',
  'OFFERED',
  'ACCEPTED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
] as const;

/** True for statuses where a courier is in motion + has a position to show. */
export function isCourierInFlight(status: string): boolean {
  return (
    status === 'ACCEPTED' ||
    status === 'PICKED_UP' ||
    status === 'IN_TRANSIT'
  );
}

/** True for statuses where the courier has already picked the order up. */
export function isAfterPickup(status: string): boolean {
  return status === 'PICKED_UP' || status === 'IN_TRANSIT';
}
