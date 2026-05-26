'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { Bike } from 'lucide-react';
import { Skeleton } from '@hir/ui';

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

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function CourierMiniMap({ courierOrderId }: { courierOrderId: string }) {
  const [data, setData] = useState<Track | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/dashboard/courier-orders/${courierOrderId}/track`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const j = (await res.json()) as Track;
        if (!cancelled) setData(j);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 12_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [courierOrderId]);

  const eta = useMemo(() => {
    if (!data) return null;
    const cl = data.courier?.last_lat;
    const cg = data.courier?.last_lng;
    if (cl == null || cg == null) return null;
    const isAfterPickup = data.status === 'PICKED_UP' || data.status === 'IN_TRANSIT';
    const target = isAfterPickup ? data.dropoff : data.pickup;
    if (target.lat == null || target.lng == null) return null;
    const km = haversineKm({ lat: cl, lng: cg }, { lat: target.lat, lng: target.lng });
    const minutes = Math.max(2, Math.round((km / 22) * 60 + 2));
    return { km, minutes, isAfterPickup };
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
              {STATUS_LABEL[data.status] ?? data.status}
              {data.courier.last_seen_at &&
                ` · ultima poziție acum ${timeAgo(data.courier.last_seen_at)}`}
            </p>
          </div>
        </div>
        {eta && (
          <span className="rounded-full bg-purple-50 px-2 py-1 text-[11px] font-semibold text-purple-800">
            ~{eta.minutes} min
          </span>
        )}
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

const STATUS_LABEL: Record<string, string> = {
  CREATED: 'Comandă transmisă',
  OFFERED: 'Oferită curierilor',
  ACCEPTED: 'Curier alocat',
  PICKED_UP: 'A ridicat mâncarea',
  IN_TRANSIT: 'În drum spre client',
  DELIVERED: 'Livrată',
  CANCELLED: 'Anulată',
};

function timeAgo(iso: string): string {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  return `${Math.floor(diff / 3600)}h`;
}
