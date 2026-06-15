'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import 'leaflet/dist/leaflet.css';

// Dynamic-import the actual map component so Leaflet (which touches `window`)
// only loads on the client. The wrapper renders a placeholder while loading.

const LeafletMap = dynamic(() => import('./_dispatch-map-inner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-xs text-zinc-500">
      Se incarca harta...
    </div>
  ),
});

export type CourierPin = {
  user_id: string;
  full_name: string | null;
  lat: number;
  lng: number;
  online: boolean;
  last_seen_at: string | null;
};

export type OrderPin = {
  id: string;
  lat: number;
  lng: number;
  status: string;
  customer_first_name: string | null;
  unassigned: boolean;
};

export function DispatchMap({
  couriers,
  orders,
  defaultCenter,
}: {
  couriers: CourierPin[];
  orders: OrderPin[];
  defaultCenter: { lat: number; lng: number };
}) {
  // Compute center from points or fall back to defaultCenter (city center).
  const center = useMemo(() => {
    const allPoints = [...couriers, ...orders];
    if (allPoints.length === 0) return defaultCenter;
    const lat = allPoints.reduce((s, p) => s + p.lat, 0) / allPoints.length;
    const lng = allPoints.reduce((s, p) => s + p.lng, 0) / allPoints.length;
    return { lat, lng };
  }, [couriers, orders, defaultCenter]);

  return (
    <div className="h-72 w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
      <LeafletMap couriers={couriers} orders={orders} center={center} />
    </div>
  );
}
