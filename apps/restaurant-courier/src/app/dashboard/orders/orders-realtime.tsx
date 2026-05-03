'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/browser';

const REFRESH_THROTTLE_MS = 1500;

type Props = {
  courierUserId: string;
};

// Subscribes to changes on courier_orders rows assigned to this courier.
// Unassigned-but-open orders still surface via the next router.refresh()
// (push notification, manual reload, sibling-channel update) — narrowing
// the filter here avoids waking every courier on unrelated INSERTs.
export function OrdersRealtime({ courierUserId }: Props) {
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

    const filter = `assigned_courier_user_id=eq.${courierUserId}`;

    const channel = supabase
      .channel(`courier:orders:auto-refresh:${courierUserId}`)
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
  }, [router, courierUserId]);

  return null;
}
