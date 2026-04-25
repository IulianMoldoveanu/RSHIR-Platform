'use client';

import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet's default marker icons reference assets that webpack/Next can't resolve;
// point them at the CDN-hosted PNGs so markers render without ejecting assets.
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

type LatLng = { lat: number; lng: number };

export function TrackMap({
  pickup,
  dropoff,
  restaurantName,
}: {
  pickup: LatLng;
  dropoff: LatLng | null;
  restaurantName: string;
}) {
  useEffect(() => {
    L.Marker.prototype.options.icon = defaultIcon;
  }, []);

  const center = dropoff
    ? { lat: (pickup.lat + dropoff.lat) / 2, lng: (pickup.lng + dropoff.lng) / 2 }
    : pickup;
  const zoom = dropoff ? 13 : 14;

  return (
    <MapContainer center={[center.lat, center.lng]} zoom={zoom} scrollWheelZoom={false} className="h-64 w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[pickup.lat, pickup.lng]} icon={defaultIcon}>
        <Popup>{restaurantName}</Popup>
      </Marker>
      {dropoff && (
        <Marker position={[dropoff.lat, dropoff.lng]} icon={defaultIcon}>
          <Popup>Adresa de livrare</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
