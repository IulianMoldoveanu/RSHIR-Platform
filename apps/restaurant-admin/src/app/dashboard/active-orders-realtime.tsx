'use client';

// Wave 1.1 — keeps the homepage "Active orders" panel fresh without polling.
// Subscribes to the same channel as /dashboard/orders (tenant:<id>:orders)
// but only routes INSERT + UPDATE events to a quiet router.refresh(). The
// chime + flash UX is intentionally handled only by the full orders list
// realtime hook so the homepage doesn't double-fire when both pages are open.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getBrowserSupabase } from '@/lib/supabase/browser';

export function ActiveOrdersRealtime({ tenantId }: { tenantId: string }) {
  const router = useRouter();

  useEffect(() => {
    if (!tenantId) return;

    const supabase = getBrowserSupabase();
    const channel: RealtimeChannel = supabase
      .channel(`tenant:${tenantId}:active-orders`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'restaurant_orders',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => router.refresh(),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'restaurant_orders',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tenantId, router]);

  return null;
}
