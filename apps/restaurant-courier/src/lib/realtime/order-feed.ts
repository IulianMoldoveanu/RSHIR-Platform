'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getBrowserSupabase } from '@/lib/supabase/browser';

export type FeedOrder = {
  id: string;
  status: string;
  vertical: 'restaurant' | 'pharma';
  customer_first_name: string | null;
  pickup_line1: string | null;
  dropoff_line1: string | null;
  delivery_fee_ron: number | null;
  created_at: string;
  assigned_courier_user_id: string | null;
};

type UseOrderFeedResult = {
  orders: FeedOrder[];
  pendingCount: number;
};

const ACTIVE_STATUSES = ['CREATED', 'OFFERED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'];

/**
 * Subscribes to Supabase Realtime channel `fleet:{fleetId}:orders` for INSERT
 * and UPDATE events on `courier_orders_feed` filtered by fleet_id.
 *
 * Returns a merged list of active orders visible to this courier. The view
 * `courier_orders_feed` from Phase A handles RLS so the courier only sees
 * orders matching their fleet and allowed verticals.
 *
 * Reconnects with exponential backoff (1s → 2s → 4s … max 30s) on disconnect.
 * Cleans up the channel subscription on unmount.
 */
export function useOrderFeed(fleetId: string): UseOrderFeedResult {
  const [orders, setOrders] = useState<FeedOrder[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const backoffRef = useRef(1000);
  const unmountedRef = useRef(false);

  const upsertOrder = useCallback((incoming: FeedOrder) => {
    if (!ACTIVE_STATUSES.includes(incoming.status)) {
      // Terminal status — remove from live list.
      setOrders((prev) => prev.filter((o) => o.id !== incoming.id));
      return;
    }
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === incoming.id);
      if (idx === -1) return [incoming, ...prev];
      const next = [...prev];
      next[idx] = incoming;
      return next;
    });
  }, []);

  const subscribe = useCallback(() => {
    if (unmountedRef.current) return;

    const supabase = getBrowserSupabase();

    // Initial fetch of active orders for this fleet.
    supabase
      .from('courier_orders_feed')
      .select('id, status, vertical, customer_first_name, pickup_line1, dropoff_line1, delivery_fee_ron, created_at, assigned_courier_user_id')
      .eq('fleet_id', fleetId)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data && !unmountedRef.current) {
          setOrders(data as FeedOrder[]);
        }
      });

    const channel = supabase
      .channel(`fleet:${fleetId}:orders`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'courier_orders',
          filter: `fleet_id=eq.${fleetId}`,
        },
        (payload) => {
          upsertOrder(payload.new as FeedOrder);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'courier_orders',
          filter: `fleet_id=eq.${fleetId}`,
        },
        (payload) => {
          upsertOrder(payload.new as FeedOrder);
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          backoffRef.current = 1000; // Reset backoff on successful connect.
        }
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          if (!unmountedRef.current) {
            // Reconnect with exponential backoff (cap at 30s).
            const delay = backoffRef.current;
            backoffRef.current = Math.min(backoffRef.current * 2, 30_000);
            setTimeout(subscribe, delay);
          }
        }
      });

    channelRef.current = channel;
  }, [fleetId, upsertOrder]);

  useEffect(() => {
    unmountedRef.current = false;
    subscribe();

    return () => {
      unmountedRef.current = true;
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [subscribe]);

  const pendingCount = orders.filter(
    (o) => o.assigned_courier_user_id === null && (o.status === 'CREATED' || o.status === 'OFFERED'),
  ).length;

  return { orders, pendingCount };
}
