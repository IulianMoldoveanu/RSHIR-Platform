'use client';

import { useEffect, useMemo, useState } from 'react';
import { Skeleton, haversineKm, etaMinutesFromKm } from '@hir/ui';
import { getBrowserSupabase } from '@/lib/realtime/supabase-browser';
import { CourierTrackView } from '@/components/storefront/courier-track-view';
import { t, type Locale } from '@/lib/i18n';

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
    vehicle_type: string | null;
    avatar_url: string | null;
    last_lat: number | null;
    last_lng: number | null;
    last_seen_at: string | null;
  } | null;
};

const ACTIVE_STATUSES = new Set(['CREATED', 'OFFERED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']);

// Staleness gating for the courier pin/ETA. On web/PWA the courier's GPS watch
// stops firing when the app is backgrounded or the screen locks, so last_seen_at
// silently ages. Showing a confident pin + ETA off a 10-min-old position is
// actively misleading at the most sensitive moment of the order, so we suppress
// the ETA past STALE and hide the pin entirely past LOST.
const STALE_MS = 3 * 60_000; // 3 min — stop trusting the ETA
const LOST_MS = 10 * 60_000; // 10 min — hide the pin, keep only the route

export function CourierTrackPanel({ ctoken, locale }: { ctoken: string; locale: Locale }) {
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
    // Never show an ETA computed from a stale fix — it would lie about how
    // close the courier is.
    const seenAt = data.courier?.last_seen_at;
    if (!seenAt || Date.now() - new Date(seenAt).getTime() >= STALE_MS) return null;
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

  const courierFirst = data.courier.first_name || 'Curierul';
  const courierGps =
    data.courier.last_lat != null && data.courier.last_lng != null
      ? { lat: data.courier.last_lat, lng: data.courier.last_lng }
      : null;
  // How fresh is the courier's position? Drives whether we trust the pin/ETA.
  const courierAgeMs = data.courier.last_seen_at
    ? Date.now() - new Date(data.courier.last_seen_at).getTime()
    : Infinity;
  const courierStale = courierAgeMs >= STALE_MS;
  const courierLost = courierAgeMs >= LOST_MS;

  // All of the presentation lives in CourierTrackView, which the marketing
  // demo renders too — see the note at the top of that file.
  return (
    <CourierTrackView
      locale={locale}
      courierName={courierFirst}
      avatarUrl={data.courier.avatar_url}
      vehicleType={data.courier.vehicle_type}
      lastSeenLabel={
        data.courier.last_seen_at
          ? t(locale, 'track.courier_seen_ago_template', {
              duration: timeAgo(data.courier.last_seen_at),
            })
          : null
      }
      stale={courierStale}
      eta={eta}
      pickup={data.pickup}
      dropoff={data.dropoff}
      courier={courierLost ? null : courierGps}
      status={data.status}
    />
  );
}

function timeAgo(iso: string): string {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  return `${Math.floor(diff / 3600)}h`;
}
