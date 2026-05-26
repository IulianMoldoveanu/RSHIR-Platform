'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { Bike } from 'lucide-react';
import {
  Skeleton,
  haversineKm,
  etaMinutesFromKm,
  isAfterPickup,
  COURIER_STATUS_LABEL_RO,
  formatRelativeAge,
} from '@hir/ui';

const MiniMap = dynamic(() => import('./courier-mini-map-leaflet').then((m) => m.CourierMiniMapLeaflet), {
  ssr: false,
  loading: () => <Skeleton className="h-48 w-full rounded-md" />,
});

type Track = {
  courier_order_id: string;
  status: string;
  pickup: { lat: number | null; lng: number | null; address: string | null };
  dropoff: { lat: number | null; lng: number | null; address: string | null };
  courier: {
    first_name: string;
    last_lat: number | null;
    last_lng: number | null;
    last_seen_at: string | null;
  } | null;
};

export function CourierMiniMap({ courierOrderId }: { courierOrderId: string }) {
  const [data, setData] = useState<Track | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/dashboard/courier-orders/${courierOrderId}/track`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const j = (await res.json()) as Track;
        if (!cancelled) {
          setData(j);
          setLastFetchAt(Date.now());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 12_000);
    // 1s tick so the "live" badge fades correctly when polling stalls,
    // without re-rendering the whole panel on every fetch.
    const tickId = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearInterval(tickId);
    };
  }, [courierOrderId]);

  const isLive = lastFetchAt != null && now - lastFetchAt < 30_000;

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
          {isLive && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700"
              aria-label="Date actualizate live"
            >
              <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              live
            </span>
          )}
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

