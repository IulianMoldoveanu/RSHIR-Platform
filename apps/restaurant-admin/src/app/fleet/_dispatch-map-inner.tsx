'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import type { CourierPin, OrderPin } from './_dispatch-map';

// Default Leaflet markers reference assets via webpack URLs that don't
// resolve under Next.js bundling. Override the icon set with inline SVG
// pins so we don't need to ship asset files in /public/leaflet.

const COURIER_ICON = L.divIcon({
  className: '',
  html: '<div style="background:#10b981;border:2px solid #fff;border-radius:50%;width:14px;height:14px;box-shadow:0 1px 3px rgba(0,0,0,.3);"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const COURIER_OFFLINE_ICON = L.divIcon({
  className: '',
  html: '<div style="background:#94a3b8;border:2px solid #fff;border-radius:50%;width:12px;height:12px;box-shadow:0 1px 3px rgba(0,0,0,.3);"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const ORDER_UNASSIGNED_ICON = L.divIcon({
  className: '',
  html: '<div style="background:#f59e0b;border:2px solid #fff;border-radius:4px;width:14px;height:14px;box-shadow:0 1px 3px rgba(0,0,0,.3);"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const ORDER_ASSIGNED_ICON = L.divIcon({
  className: '',
  html: '<div style="background:#6366f1;border:2px solid #fff;border-radius:4px;width:12px;height:12px;box-shadow:0 1px 3px rgba(0,0,0,.3);"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

export default function LeafletMap({
  couriers,
  orders,
  center,
}: {
  couriers: CourierPin[];
  orders: OrderPin[];
  center: { lat: number; lng: number };
}) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={12}
      scrollWheelZoom={false}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      {couriers.map((c) => (
        <Marker
          key={`c-${c.user_id}`}
          position={[c.lat, c.lng]}
          icon={c.online ? COURIER_ICON : COURIER_OFFLINE_ICON}
        >
          <Popup>
            <strong>{c.full_name ?? 'Curier'}</strong>
            <br />
            {c.online ? 'ONLINE' : 'OFFLINE'}
            {c.last_seen_at ? (
              <>
                <br />
                <small>Ultim semn: {new Date(c.last_seen_at).toLocaleTimeString('ro-RO')}</small>
              </>
            ) : null}
          </Popup>
        </Marker>
      ))}
      {orders.map((o) => (
        <Marker
          key={`o-${o.id}`}
          position={[o.lat, o.lng]}
          icon={o.unassigned ? ORDER_UNASSIGNED_ICON : ORDER_ASSIGNED_ICON}
        >
          <Popup>
            <strong>Comanda #{o.id.slice(0, 8)}</strong>
            <br />
            Status: {o.status}
            <br />
            Client: {o.customer_first_name ?? '—'}
            <br />
            {o.unassigned ? <em>NEALOCATA</em> : <em>Alocata</em>}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
