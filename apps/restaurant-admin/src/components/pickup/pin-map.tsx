'use client';

import 'leaflet/dist/leaflet.css';

import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';

// Leaflet resolves its default marker images relative to the CSS file's own
// path, which Next's bundler rewrites — the icon 404s and the marker becomes
// invisible with an unreliable hit-area. Same fix as zones/zone-map.tsx.
if (typeof window !== 'undefined') {
  L.Icon.Default.mergeOptions({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

export type LatLng = { lat: number; lng: number };

function ClickToPlace({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({
    click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }),
  });
  return null;
}

/**
 * Bring the pin into view when it moved from outside the map — an address
 * search or a pasted coordinate pair. Dragging the marker also updates
 * `value`, so we only recentre when the point is off-screen; recentring on
 * every change would yank the map out from under the operator's finger
 * mid-drag.
 */
function KeepPinInView({ value }: { value: LatLng | null }) {
  const map = useMap();
  // Depend on the numbers, not the object: one caller builds `value` inline
  // on every render, and an object dep would re-run this on every unrelated
  // keystroke — snapping the map back the moment the operator panned away
  // to look at a neighbouring street.
  const lat = value?.lat ?? null;
  const lng = value?.lng ?? null;
  useEffect(() => {
    if (lat === null || lng === null) return;
    const point = L.latLng(lat, lng);
    if (!map.getBounds().contains(point)) {
      map.setView(point, Math.max(map.getZoom(), 16));
    }
  }, [map, lat, lng]);
  return null;
}

export function PinMap({
  value,
  onChange,
  disabled = false,
  initialCenter,
  height = 300,
}: {
  value: LatLng | null;
  onChange: (p: LatLng) => void;
  disabled?: boolean;
  initialCenter: LatLng;
  height?: number;
}) {
  return (
    <MapContainer
      // react-leaflet ignores `center` after mount by design; KeepPinInView
      // owns every later move.
      center={[value?.lat ?? initialCenter.lat, value?.lng ?? initialCenter.lng]}
      zoom={value ? 16 : 13}
      scrollWheelZoom
      style={{ height: `${height}px`, width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {value && (
        <Marker
          position={[value.lat, value.lng]}
          draggable={!disabled}
          eventHandlers={{
            dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              onChange({ lat: ll.lat, lng: ll.lng });
            },
          }}
        />
      )}

      {!disabled && <ClickToPlace onPick={onChange} />}
      <KeepPinInView value={value} />
    </MapContainer>
  );
}
