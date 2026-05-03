'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/browser';

const REFRESH_THROTTLE_MS = 1500;

export function OrdersRealtime() {
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

    const channel = supabase
      .channel('courier:orders:auto-refresh')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'courier_orders' },
        triggerRefresh,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'courier_orders' },
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
  }, [router]);

  return null;
}
