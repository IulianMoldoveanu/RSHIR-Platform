'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/browser';

const REFRESH_THROTTLE_MS = 1500;

// Statuses where an unassigned order is still claimable by any rider in the
// fleet. Anything outside this set is terminal or already owned by another
// rider, so seeing the change wouldn't change what THIS rider can act on.
const CLAIMABLE_STATUSES = new Set(['CREATED', 'OFFERED']);

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
// AND, when applicable, to newly-offered unassigned orders on the same fleet.
//
// Before: only assigned orders triggered router.refresh(); fresh OFFERED
// orders required a manual refresh to appear. That meant the "Comenzi
// disponibile" list could be stale by minutes — the worst-case operational
// failure mode on this page.
//
// After: we keep the assigned filter (cheap, narrow), and add a second
// fleet-wide subscription gated on `watchFleetOpenOrders`. The handler
// rejects payloads that aren't claimable (assigned + non-OFFERED/CREATED)
// so noise from in-flight orders doesn't churn the page.
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

    // Only refresh on fleet events the rider could actually claim. Without
    // this guard, every PICKED_UP/IN_TRANSIT update on any fleet order would
    // wake this courier even though it's irrelevant to their open list.
    const triggerOnClaimable = (payload: { new: OrderRowPayload }) => {
      const row = payload.new ?? {};
      if (row.assigned_courier_user_id) return;
      if (!row.status || !CLAIMABLE_STATUSES.has(row.status)) return;
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
          triggerOnClaimable,
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'courier_orders', filter: fleetFilter },
          triggerOnClaimable,
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
