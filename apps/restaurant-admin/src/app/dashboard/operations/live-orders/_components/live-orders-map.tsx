'use client';

import 'leaflet/dist/leaflet.css';

import { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import type { LiveOrder } from '../page';

// Default center: Brasov (pilot city).
const DEFAULT_CENTER: [number, number] = [45.6427, 25.5887];
const DEFAULT_ZOOM = 13;

// Leaflet default icon path fix (webpack bundles don't inline the image URLs).
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

const orangeIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const selectedIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

type Props = {
  orders: LiveOrder[];
  selectedOrderId: string | null;
  onSelectOrder: (id: string) => void;
};

export function LiveOrdersMap({ orders, selectedOrderId, onSelectOrder }: Props) {
  // Only orders that have coordinates — edge case: order without dropoff coords.
  const mappable = useMemo(
    () =>
      orders.filter(
        (o): o is LiveOrder & { dropoff_lat: number; dropoff_lng: number } =>
          o.dropoff_lat !== null && o.dropoff_lng !== null,
      ),
    [orders],
  );

  if (mappable.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-50 text-sm text-zinc-400">
        Nicio comanda IN_TRANSIT cu coordonate disponibile.
      </div>
    );
  }

  const firstOrder = mappable[0];
  const center: [number, number] = firstOrder
    ? [firstOrder.dropoff_lat, firstOrder.dropoff_lng]
    : DEFAULT_CENTER;

  return (
    <MapContainer
      center={center}
      zoom={DEFAULT_ZOOM}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {mappable.map((o) => (
        <Marker
          key={o.id}
          position={[o.dropoff_lat, o.dropoff_lng]}
          icon={o.id === selectedOrderId ? selectedIcon : orangeIcon}
          eventHandlers={{ click: () => onSelectOrder(o.id) }}
        >
          <Popup>
            <div className="text-xs">
              <p className="font-semibold">#{o.id.slice(0, 8)}</p>
              <p className="mt-0.5 text-zinc-600">{o.dropoff_line1 ?? 'Adresa lipsa'}</p>
              {o.customer_first_name && (
                <p className="text-zinc-500">{o.customer_first_name}</p>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
