'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { Bike, MapPin, Clock } from 'lucide-react';
import { Skeleton, haversineKm, etaMinutesFromKm } from '@hir/ui';
import { getBrowserSupabase } from '@/lib/realtime/supabase-browser';

const CourierMap = dynamic(() => import('./CourierMap').then((m) => m.CourierMap), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-md bg-zinc-100" />,
});

type CourierTrack = {
  courier_order_id: string;
  status: string;
  source_type: string;
  created_at: string;
  updated_at: string;
  pickup: { lat: number | null; lng: number | null; address: string | null };
  dropoff: { lat: number | null; lng: number | null };
  customer_first_name: string | null;
  courier: {
    first_name: string;
    last_lat: number | null;
    last_lng: number | null;
    last_seen_at: string | null;
  } | null;
};

const ACTIVE_STATUSES = new Set(['CREATED', 'OFFERED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']);

export function CourierTrackPanel({ ctoken }: { ctoken: string }) {
  const [data, setData] = useState<CourierTrack | null>(null);
  const [loading, setLoading] = useState(true);

  // Initial fetch + polling fallback (15s).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/courier-track/${ctoken}`, { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as CourierTrack;
        if (!cancelled) setData(json);
      } catch {
        // swallow
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ctoken]);

  // Subscribe to courier_orders UPDATE so status/assignment changes refetch
  // immediately. GPS pin movement comes from the 15s poll above (we cannot
  // RLS-listen to courier_shifts as anon — the SECURITY DEFINER RPC bypasses
  // RLS during the fetch).
  const courierOrderId = data?.courier_order_id ?? null;
  useEffect(() => {
    if (!courierOrderId) return;
    const sb = getBrowserSupabase();
    const channel = sb
      .channel(`courier-track:${ctoken}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'courier_orders',
          filter: `id=eq.${courierOrderId}`,
        },
        () => {
          fetch(`/api/courier-track/${ctoken}`, { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => j && setData(j as CourierTrack))
            .catch(() => undefined);
        },
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [ctoken, courierOrderId]);

  const eta = useMemo(() => {
    if (!data) return null;
    const cl = data.courier?.last_lat;
    const cg = data.courier?.last_lng;
    if (cl == null || cg == null) return null;
    const target =
      data.status === 'PICKED_UP' || data.status === 'IN_TRANSIT'
        ? data.dropoff
        : data.pickup;
    if (target.lat == null || target.lng == null) return null;
    const km = haversineKm(
      { lat: cl, lng: cg },
      { lat: target.lat, lng: target.lng },
    );
    return { minutes: etaMinutesFromKm(km), km };
  }, [data]);

  if (loading) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <Skeleton className="mb-3 h-3 w-32" />
        <Skeleton className="mb-2 h-5 w-48" />
        <Skeleton className="h-56 w-full rounded-md" />
      </section>
    );
  }

  if (!data || !data.courier || !ACTIVE_STATUSES.has(data.status)) {
    // Hide entirely until a courier is assigned & in-flight.
    return null;
  }

  const courierFirst = data.courier.first_name || 'Curierul HIR';
  const courierGps =
    data.courier.last_lat != null && data.courier.last_lng != null
      ? { lat: data.courier.last_lat, lng: data.courier.last_lng }
      : null;

  return (
    <section className="overflow-hidden rounded-xl border border-purple-200 bg-purple-50/40">
      <header className="flex items-baseline justify-between gap-3 border-b border-purple-200/60 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-600 text-white">
            <Bike className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-zinc-900">
              {courierFirst} este pe drum
            </p>
            {data.courier.last_seen_at && (
              <p className="text-[11px] text-zinc-500">
                ultima poziție acum {timeAgo(data.courier.last_seen_at)}
              </p>
            )}
          </div>
        </div>
        {eta && (
          <div className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-purple-800 shadow-sm">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            <span>~{eta.minutes} min</span>
          </div>
        )}
      </header>
      <CourierMap
        pickup={data.pickup}
        dropoff={data.dropoff}
        courier={courierGps}
        status={data.status}
      />
      {eta && (
        <p className="px-4 py-2 text-xs text-purple-900/80">
          <MapPin className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
          {eta.km < 1
            ? `Curierul este la mai puțin de 1 km de tine.`
            : `Curierul este la ~${eta.km.toFixed(1)} km de ${data.status === 'PICKED_UP' || data.status === 'IN_TRANSIT' ? 'tine' : 'restaurant'}.`}
        </p>
      )}
    </section>
  );
}

function timeAgo(iso: string): string {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  return `${Math.floor(diff / 3600)}h`;
}
