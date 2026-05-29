'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Bike } from 'lucide-react';
import {
  Skeleton,
  LiveBadge,
  haversineKm,
  etaMinutesFromKm,
  isAfterPickup,
  COURIER_STATUS_LABEL_RO,
  formatRelativeAge,
} from '@hir/ui';
import { getBrowserSupabase } from '@/lib/supabase/browser';

const MiniMap = dynamic(() => import('./courier-mini-map-leaflet').then((m) => m.CourierMiniMapLeaflet), {
  ssr: false,
  loading: () => <Skeleton className="h-48 w-full rounded-md" />,
});

type Track = {
  courier_order_id: string;
  status: string;
  assigned_courier_user_id: string | null;
  pickup: { lat: number | null; lng: number | null; address: string | null };
  dropoff: { lat: number | null; lng: number | null; address: string | null };
  courier: {
    first_name: string;
    last_lat: number | null;
    last_lng: number | null;
    last_seen_at: string | null;
  } | null;
};

// Audit P0 #8 — replace 12s polling with Supabase Realtime subscriptions.
//
// We subscribe to two streams:
//   1. courier_orders UPDATE filtered by id — catches status/assignment
//      changes (e.g. ACCEPTED → PICKED_UP, courier reassignment).
//   2. courier_shifts UPDATE filtered by courier_user_id (once we know who
//      is assigned) — catches GPS pings as the courier moves. The track
//      API server-side joins both, so any event triggers a single refetch
//      to keep the response shape stable.
//
// Render throttle: at most 1 fetch/state update per 1000ms so a burst of
// GPS pings on slow Leaflet builds can't thrash the map.
//
// Watchdog: if no realtime event arrives for 60s, log a warning and
// refetch + recreate subscription. Reconnect backoff mirrors the courier
// app's order-feed.ts pattern (1s → 2s → 4s … cap 30s).
const RENDER_THROTTLE_MS = 1000;
const WATCHDOG_INTERVAL_MS = 30_000;
const WATCHDOG_STALL_MS = 60_000;

export function CourierMiniMap({ courierOrderId }: { courierOrderId: string }) {
  const [data, setData] = useState<Track | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  // Refs survive across reconnect closures without re-firing the effect.
  const unmountedRef = useRef(false);
  const ordersChannelRef = useRef<RealtimeChannel | null>(null);
  const shiftsChannelRef = useRef<RealtimeChannel | null>(null);
  const lastFetchAtRef = useRef(0);
  const pendingFetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assignedCourierIdRef = useRef<string | null>(null);

  // Single fetch function used by initial mount, realtime events, watchdog
  // and reconnect paths. Throttled to once per RENDER_THROTTLE_MS.
  const fetchTrack = useCallback(async () => {
    if (unmountedRef.current) return;
    const since = Date.now() - lastFetchAtRef.current;
    if (since < RENDER_THROTTLE_MS) {
      // Coalesce: schedule one trailing fetch at the boundary.
      if (pendingFetchRef.current) return;
      pendingFetchRef.current = setTimeout(() => {
        pendingFetchRef.current = null;
        void fetchTrack();
      }, RENDER_THROTTLE_MS - since);
      return;
    }
    lastFetchAtRef.current = Date.now();
    try {
      const res = await fetch(`/api/dashboard/courier-orders/${courierOrderId}/track`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const j = (await res.json()) as Track;
      if (unmountedRef.current) return;
      setData(j);
      setLastEventAt(Date.now());
      // If the assigned courier changed, re-subscribe to their shift row.
      const newCourierUserId = j.assigned_courier_user_id ?? null;
      if (newCourierUserId !== assignedCourierIdRef.current) {
        assignedCourierIdRef.current = newCourierUserId;
        resubscribeShifts();
      }
    } finally {
      if (!unmountedRef.current) setLoading(false);
    }
    // resubscribeShifts is stable via ref — declared below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courierOrderId]);

  // Re-attach to the assigned courier's shift row whenever the
  // assignment changes. Filtered server-side by courier_user_id so the
  // browser only receives this courier's GPS pings (other couriers'
  // pings never traverse RLS into this client).
  const resubscribeShifts = useCallback(() => {
    if (unmountedRef.current) return;
    const supabase = getBrowserSupabase();
    if (shiftsChannelRef.current) {
      void supabase.removeChannel(shiftsChannelRef.current);
      shiftsChannelRef.current = null;
    }
    const courierUserId = assignedCourierIdRef.current;
    if (!courierUserId) return;

    const channel = supabase
      .channel(`courier:${courierOrderId}:shift`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'courier_shifts',
          filter: `courier_user_id=eq.${courierUserId}`,
        },
        () => {
          setLastEventAt(Date.now());
          void fetchTrack();
        },
      )
      .subscribe();
    shiftsChannelRef.current = channel;
  }, [courierOrderId, fetchTrack]);

  const subscribe = useCallback(() => {
    if (unmountedRef.current) return;
    const supabase = getBrowserSupabase();

    // Initial load — also primes assignedCourierIdRef so the shift channel
    // can attach.
    void fetchTrack();

    const channel = supabase
      .channel(`courier:${courierOrderId}:track`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'courier_orders',
          filter: `id=eq.${courierOrderId}`,
        },
        () => {
          setLastEventAt(Date.now());
          void fetchTrack();
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          backoffRef.current = 1000;
        }
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (unmountedRef.current) return;
          if (ordersChannelRef.current) {
            void ordersChannelRef.current.unsubscribe();
            ordersChannelRef.current = null;
          }
          if (shiftsChannelRef.current) {
            void supabase.removeChannel(shiftsChannelRef.current);
            shiftsChannelRef.current = null;
          }
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          const delay = backoffRef.current;
          backoffRef.current = Math.min(backoffRef.current * 2, 30_000);
          reconnectTimerRef.current = setTimeout(subscribe, delay);
        }
      });
    ordersChannelRef.current = channel;
  }, [courierOrderId, fetchTrack]);

  useEffect(() => {
    unmountedRef.current = false;
    subscribe();

    // 1s tick so the "live" badge fades correctly without re-rendering the
    // whole panel on every event.
    const tickId = setInterval(() => setNow(Date.now()), 1000);

    // Watchdog: every WATCHDOG_INTERVAL_MS, if no event landed for
    // WATCHDOG_STALL_MS, warn + refetch + force-reconnect the orders
    // channel. Belt-and-suspenders against silent realtime drops.
    const watchdogId = setInterval(() => {
      const since = Date.now() - (lastFetchAtRef.current || Date.now());
      if (since > WATCHDOG_STALL_MS) {
        // eslint-disable-next-line no-console
        console.warn(
          `[courier-mini-map] no realtime event in ${Math.round(since / 1000)}s, refetching + reconnecting`,
        );
        void fetchTrack();
        const supabase = getBrowserSupabase();
        if (ordersChannelRef.current) {
          void supabase.removeChannel(ordersChannelRef.current);
          ordersChannelRef.current = null;
        }
        subscribe();
      }
    }, WATCHDOG_INTERVAL_MS);

    return () => {
      unmountedRef.current = true;
      clearInterval(tickId);
      clearInterval(watchdogId);
      if (pendingFetchRef.current) clearTimeout(pendingFetchRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      const supabase = getBrowserSupabase();
      if (ordersChannelRef.current) {
        void supabase.removeChannel(ordersChannelRef.current);
        ordersChannelRef.current = null;
      }
      if (shiftsChannelRef.current) {
        void supabase.removeChannel(shiftsChannelRef.current);
        shiftsChannelRef.current = null;
      }
    };
  }, [subscribe, fetchTrack]);

  const isLive = lastEventAt != null && now - lastEventAt < 30_000;

  const eta = useMemo(() => {
    if (!data) return null;
    const cl = data.courier?.last_lat;
    const cg = data.courier?.last_lng;
    if (cl == null || cg == null) return null;
    const afterPickup = isAfterPickup(data.status);
    const target = afterPickup ? data.dropoff : data.pickup;
    if (target.lat == null || target.lng == null) return null;
    const km = haversineKm({ lat: cl, lng: cg }, { lat: target.lat, lng: target.lng });
    const minutes = etaMinutesFromKm(km);
    return { km, minutes, isAfterPickup: afterPickup };
  }, [data]);

  if (loading || !data) {
    return (
      <div className="rounded-md border border-zinc-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">Curier</h2>
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
    );
  }

  if (!data.courier) {
    return (
      <div className="rounded-md border border-zinc-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">Curier</h2>
        <p className="text-xs text-zinc-500">
          Niciun curier alocat încă. Așteaptă să accepte cineva sau sună unul din flota ta.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-100 text-purple-700">
            <Bike className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-zinc-900">{data.courier.first_name}</p>
            <p className="text-[11px] text-zinc-500">
              {COURIER_STATUS_LABEL_RO[data.status as keyof typeof COURIER_STATUS_LABEL_RO] ?? data.status}
              {data.courier.last_seen_at &&
                ` · ultima poziție acum ${formatRelativeAge(data.courier.last_seen_at)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLive && <LiveBadge />}
          {eta && (
            <span className="rounded-full bg-purple-50 px-2 py-1 text-[11px] font-semibold text-purple-800">
              ~{eta.minutes} min
            </span>
          )}
        </div>
      </header>
      <MiniMap
        pickup={data.pickup}
        dropoff={data.dropoff}
        courier={
          data.courier.last_lat != null && data.courier.last_lng != null
            ? { lat: data.courier.last_lat, lng: data.courier.last_lng }
            : null
        }
        status={data.status}
      />
      {eta && (
        <p className="mt-2 text-[11px] text-zinc-500">
          Curierul este la ~{eta.km.toFixed(1)} km de{' '}
          {eta.isAfterPickup ? 'client' : 'restaurant'}.
        </p>
      )}
    </div>
  );
}
