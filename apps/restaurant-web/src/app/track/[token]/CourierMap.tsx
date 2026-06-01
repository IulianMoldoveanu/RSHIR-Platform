'use client';

import { useEffect, useMemo } from 'react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { CourierMarker } from '@hir/ui';

const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Build courier divIcon using CourierMarker. This module is lazy-loaded via
// next/dynamic with ssr:false so it only runs client-side.
// vehicle: 'bike' — no vehicle_type data on tracking page, default to bike.
// animate: true — single courier on customer tracking deserves the pulse halo.
const courierIcon = L.divIcon({
  className: '',
  html: renderToStaticMarkup(
    React.createElement(CourierMarker, {
      vehicle: 'bike',
      status: 'online',
      heading: 0,
      animate: true,
      size: 64,
    }),
  ),
  iconSize: [64, 80],
  iconAnchor: [32, 80],
});

type LatLng = { lat: number; lng: number };
type MaybeLatLng = { lat: number | null; lng: number | null };

function isPoint(p: MaybeLatLng | null | undefined): p is LatLng {
  return !!p && typeof p.lat === 'number' && typeof p.lng === 'number';
}

function FitToBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [map, points]);
  return null;
}

export function CourierMap({
  pickup,
  dropoff,
  courier,
  status,
}: {
  pickup: MaybeLatLng;
  dropoff: MaybeLatLng;
  courier: LatLng | null;
  status: string;
}) {
  const pickupPt = isPoint(pickup) ? pickup : null;
  const dropoffPt = isPoint(dropoff) ? dropoff : null;
  const isAfterPickup = status === 'PICKED_UP' || status === 'IN_TRANSIT';

  const points = useMemo(() => {
    const arr: LatLng[] = [];
    if (pickupPt) arr.push(pickupPt);
    if (dropoffPt) arr.push(dropoffPt);
    if (courier) arr.push(courier);
    return arr;
  }, [pickupPt, dropoffPt, courier]);

  const center = points[0] ?? { lat: 45.6427, lng: 25.5887 };

  const courierToTarget = useMemo(() => {
    if (!courier) return null;
    const target = isAfterPickup ? dropoffPt : pickupPt;
    if (!target) return null;
    return [
      [courier.lat, courier.lng],
      [target.lat, target.lng],
    ] as [number, number][];
  }, [courier, isAfterPickup, dropoffPt, pickupPt]);

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={14}
      scrollWheelZoom={false}
      className="h-56 w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToBounds points={points} />
      {pickupPt && (
        <Marker position={[pickupPt.lat, pickupPt.lng]} icon={defaultIcon}>
          <Popup>Restaurant</Popup>
        </Marker>
      )}
      {dropoffPt && (
        <Marker position={[dropoffPt.lat, dropoffPt.lng]} icon={defaultIcon}>
          <Popup>Adresa ta</Popup>
        </Marker>
      )}
      {courier && (
        <Marker position={[courier.lat, courier.lng]} icon={courierIcon}>
          <Popup>Curier</Popup>
        </Marker>
      )}
      {courierToTarget && (
        <Polyline
          positions={courierToTarget}
          pathOptions={{ color: '#7c3aed', weight: 3, opacity: 0.7, dashArray: '6 8' }}
        />
      )}
    </MapContainer>
  );
}
