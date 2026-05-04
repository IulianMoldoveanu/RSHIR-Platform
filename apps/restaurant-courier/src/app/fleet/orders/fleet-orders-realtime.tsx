'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/browser';

const REFRESH_THROTTLE_MS = 1500;

type Props = {
  fleetId: string;
};

// Mirror of the rider-side OrdersRealtime, scoped to a fleet instead of a
// single courier_user_id. Drives the dispatch board so a manager sees new
// orders + status changes without a manual refresh.
//
// Throttled at 1.5s to coalesce bursts (e.g. rider taps "Picked up" which
// fires UPDATE on courier_orders + INSERT on courier_shifts in the same
// few-hundred-ms window) into a single router.refresh().
export function FleetOrdersRealtime({ fleetId }: Props) {
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

    const filter = `fleet_id=eq.${fleetId}`;

    const channel = supabase
      .channel(`fleet:orders:auto-refresh:${fleetId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'courier_orders', filter },
        triggerRefresh,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'courier_orders', filter },
        triggerRefresh,
      )
      .subscribe();

    return () => {
      if (pendingRef.current) {
        clearTimeout(pendingRef.current);
        pendingRef.current = null;
      }
      channel.unsubscribe();
    };
  }, [router, fleetId]);

  return null;
}
