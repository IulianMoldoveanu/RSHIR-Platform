'use client';

import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

import { useMemo } from 'react';
import L from 'leaflet';
import 'leaflet-draw';
import { MapContainer, TileLayer, Polygon as LeafletPolygon, FeatureGroup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import type { Zone, Polygon } from './types';

// Brașov default center (per spec).
const DEFAULT_CENTER: [number, number] = [45.6427, 25.5887];
const DEFAULT_ZOOM = 12;

// Convert GeoJSON polygon (lng, lat) to Leaflet positions (lat, lng).
function toLatLngs(polygon: Polygon): [number, number][] {
  const ring = polygon.coordinates[0] ?? [];
  return ring.map(([lng, lat]) => [lat, lng]);
}

// Convert Leaflet layer (polygon) back to GeoJSON polygon.
function layerToPolygon(layer: L.Layer): Polygon | null {
  const geo = (layer as L.Polygon).toGeoJSON();
  // toGeoJSON returns a Feature; pull geometry out.
  const geom = (geo as { geometry?: { type: string; coordinates: number[][][] } }).geometry;
  if (!geom || geom.type !== 'Polygon') return null;
  return {
    type: 'Polygon',
    coordinates: geom.coordinates as [number, number][][],
  };
}

type Props = {
  zones: Zone[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onPolygonDrawn: (polygon: Polygon) => void;
};

export function ZoneMap({ zones, selectedId, onSelect, onPolygonDrawn }: Props) {
  // Compute bounds from existing zones; fallback to Brașov center.
  const initialView = useMemo(() => {
    if (zones.length === 0) return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
    const allPoints = zones.flatMap((z) => toLatLngs(z.polygon));
    if (allPoints.length === 0) return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
    return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
  }, [zones]);

  return (
    <MapContainer
      center={initialView.center}
      zoom={initialView.zoom}
      style={{ height: '520px', width: '100%' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Existing zones rendered as static polygons (click to select). */}
      {zones.map((z) => (
        <LeafletPolygon
          key={z.id}
          positions={toLatLngs(z.polygon)}
          pathOptions={{
            color: z.id === selectedId ? '#7c3aed' : z.is_active ? '#10b981' : '#a1a1aa',
            weight: z.id === selectedId ? 3 : 2,
            fillOpacity: 0.2,
          }}
          eventHandlers={{
            click: () => onSelect(z.id),
          }}
        />
      ))}

      {/* Drawing layer for new polygons. Edits to existing zones are handled
          via the static polygons above, not the draw toolbar's edit handle. */}
      <FeatureGroup>
        <EditControl
          position="topleft"
          draw={{
            polygon: {
              allowIntersection: false,
              showArea: false,
              shapeOptions: { color: '#7c3aed', weight: 2 },
            },
            rectangle: false,
            polyline: false,
            circle: false,
            circlemarker: false,
            marker: false,
          }}
          edit={{ edit: false, remove: false }}
          onCreated={(e: { layer: L.Layer }) => {
            const polygon = layerToPolygon(e.layer);
            if (polygon) onPolygonDrawn(polygon);
            // Remove the draw layer so we don't double-render once the zone is saved.
            (e.layer as L.Layer & { remove?: () => void }).remove?.();
          }}
        />
      </FeatureGroup>
    </MapContainer>
  );
}
