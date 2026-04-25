'use client';

import { create } from 'zustand';

/**
 * Stores live menu availability per item_id.
 *
 * Initial values come from the SSR-rendered storefront (item.is_available);
 * the realtime subscription overlays updates as `menu_events` rows arrive.
 *
 * Consumers (e.g. RSHIR-9 storefront) read via `useAvailability(itemId)`.
 */
type AvailabilityState = {
  byItemId: Record<string, boolean>;
  setMany(entries: Record<string, boolean>): void;
  set(itemId: string, isAvailable: boolean): void;
};

export const useAvailabilityStore = create<AvailabilityState>((set) => ({
  byItemId: {},
  setMany: (entries) =>
    set((s) => ({ byItemId: { ...s.byItemId, ...entries } })),
  set: (itemId, isAvailable) =>
    set((s) => ({ byItemId: { ...s.byItemId, [itemId]: isAvailable } })),
}));

/**
 * Read-only selector. Returns the live availability for `itemId`,
 * or `fallback` if the store has no entry yet.
 */
export function useAvailability(itemId: string, fallback: boolean): boolean {
  return useAvailabilityStore(
    (s) => s.byItemId[itemId] ?? fallback,
  );
}
