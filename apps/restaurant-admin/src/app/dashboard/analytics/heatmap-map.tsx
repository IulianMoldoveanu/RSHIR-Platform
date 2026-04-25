'use client';

import 'leaflet/dist/leaflet.css';

import { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet.heat';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { HeatmapPoint } from './types';

const DEFAULT_CENTER: [number, number] = [45.6427, 25.5887]; // Brașov
const DEFAULT_ZOOM = 11;

function HeatLayer({ points }: { points: HeatmapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const latLngs = points.map((p) => [p.lat, p.lng, 0.5]) as Array<[number, number, number]>;
    const heat = (
      L as unknown as { heatLayer: (latLngs: unknown, opts: unknown) => L.Layer }
    ).heatLayer(latLngs, {
      radius: 25,
      blur: 18,
      minOpacity: 0.35,
      gradient: { 0.4: '#a78bfa', 0.7: '#7c3aed', 1: '#4c1d95' },
    });
    heat.addTo(map);
    // Auto-fit to point bounds.
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.1));
    return () => {
      map.removeLayer(heat);
    };
  }, [map, points]);
  return null;
}

export function HeatmapMap({ points }: { points: HeatmapPoint[] }) {
  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ height: '400px', width: '100%' }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <HeatLayer points={points} />
    </MapContainer>
  );
}
