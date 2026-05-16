'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { isOfferSoundEnabled, playOfferChirp } from '@/lib/offer-sound';

const REFRESH_THROTTLE_MS = 1500;

// Fleet-wide status transitions that affect the rider's "Comenzi
// disponibile" list semantics. We refresh on:
//   - CREATED/OFFERED       : a new claimable order entered the fleet
//   - ACCEPTED              : someone (possibly another rider) just claimed
//                              an order — it must disappear from my list
//   - CANCELLED             : an unassigned order was withdrawn before any
//                              rider took it — also removes it
//
// Excluded from refresh (pure in-flight noise once an order is owned by
// another courier): PICKED_UP, IN_TRANSIT, DELIVERED, FAILED. None of
// these change what THIS rider can act on from the open list.
const OPEN_LIST_RELEVANT_STATUSES = new Set([
  'CREATED',
  'OFFERED',
  'ACCEPTED',
  'CANCELLED',
]);

type Props = {
  courierUserId: string;
  // Fleet the courier belongs to (platform-default for Mode A/B riders).
  // Required to surface newly-offered orders live without a manual refresh.
  // Null when the page can't resolve it — falls back to the previous
  // assigned-only behaviour so we never regress.
  fleetId: string | null;
  // Mode C riders are dispatched by a fleet manager and never see the
  // "available orders" section. Skip the fleet-wide subscription for them
  // so we don't wake their device on every fleet event they can't act on.
  watchFleetOpenOrders: boolean;
};

// Subscribes to changes on courier_orders rows assigned to this courier
// AND, when applicable, to open-list-relevant transitions on the same fleet.
//
// Two subscriptions:
//   1. Assigned filter (always): refresh on any change to MY orders.
//   2. Fleet filter (gated by watchFleetOpenOrders): refresh on
//      CREATED/OFFERED/ACCEPTED/CANCELLED transitions, regardless of
//      assignee. ACCEPTED is included so when peer claims an order MY
//      list drops it immediately — that's the race-condition guard.
//      In-flight noise (PICKED_UP/IN_TRANSIT/DELIVERED/FAILED on peer
//      orders) is filtered out in the handler so we don't churn the
//      page on every map-tick worth of status updates.
export function OrdersRealtime({ courierUserId, fleetId, watchFleetOpenOrders }: Props) {
  const router = useRouter();
  const lastRefreshRef = useRef(0);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = getBrowserSupabase();

    const triggerRefresh = () => {
      const now = Date.now();
      const elapsed = now - lastRefreshRef.current;
      if (elapsed >= REFRESH_THROTTLE_MS) {
        lastRefreshRef.current = now;
        router.refresh();
        return;
      }
      if (pendingRef.current) return;
      pendingRef.current = setTimeout(() => {
        pendingRef.current = null;
        lastRefreshRef.current = Date.now();
        router.refresh();
      }, REFRESH_THROTTLE_MS - elapsed);
    };

    type OrderRowPayload = {
      status?: string | null;
      assigned_courier_user_id?: string | null;
    };

    // Refresh only on fleet events that change the open-list semantics
    // (see OPEN_LIST_RELEVANT_STATUSES above). The previous version skipped
    // ACCEPTED — meaning when another rider claimed an order, MY list would
    // still show it as "Available" until I manually tapped Actualizează.
    // That was the worst race-condition UX: two riders could both tap to
    // accept the same order, then the loser would silently get "already
    // taken" with no in-app cue. Now every claim transition fans out as a
    // refresh to peers on the fleet.
    const triggerOnFleetActivity = (payload: {
      eventType?: string;
      new: OrderRowPayload;
    }) => {
      const row = payload.new ?? {};
      if (!row.status || !OPEN_LIST_RELEVANT_STATUSES.has(row.status)) return;
      // Play the offer chirp on transitions that surface a new claimable
      // order (INSERT or UPDATE landing on CREATED/OFFERED). ACCEPTED and
      // CANCELLED still trigger a refresh but no sound — the courier
      // either lost the race or saw a peer claim, no new opportunity.
      const isNewOpenOrder =
        (row.status === 'CREATED' || row.status === 'OFFERED') &&
        (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE');
      if (isNewOpenOrder && isOfferSoundEnabled()) {
        playOfferChirp();
      }
      triggerRefresh();
    };

    const assignedFilter = `assigned_courier_user_id=eq.${courierUserId}`;

    const channel = supabase
      .channel(`courier:orders:auto-refresh:${courierUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'courier_orders', filter: assignedFilter },
        triggerRefresh,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'courier_orders', filter: assignedFilter },
        triggerRefresh,
      );

    // Second subscription: fleet-wide unassigned orders. Postgres realtime
    // filters don't support `AND IS NULL`, so we filter by fleet_id only
    // and reject non-claimable payloads in the handler above.
    if (watchFleetOpenOrders && fleetId) {
      const fleetFilter = `fleet_id=eq.${fleetId}`;
      channel
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'courier_orders', filter: fleetFilter },
          triggerOnFleetActivity,
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'courier_orders', filter: fleetFilter },
          triggerOnFleetActivity,
        );
    }

    channel.subscribe();

    return () => {
      if (pendingRef.current) {
        clearTimeout(pendingRef.current);
        pendingRef.current = null;
      }
      channel.unsubscribe();
    };
  }, [router, courierUserId, fleetId, watchFleetOpenOrders]);

  return null;
}
