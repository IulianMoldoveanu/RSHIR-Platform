'use client';

import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

import { useEffect, useMemo, useState, type ComponentType } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Polygon as LeafletPolygon, FeatureGroup } from 'react-leaflet';
import type { Zone, Polygon } from './types';

// leaflet-draw is a UMD plugin that augments window.L at import time. Under
// `import L from 'leaflet'` in a Next.js client bundle, L is a local
// binding and window.L is undefined, so a static `import 'leaflet-draw'`
// crashes with `ReferenceError: L is not defined`. Set window.L before any
// leaflet-draw code executes; the dynamic import below then resolves.
if (typeof window !== 'undefined') {
  (window as unknown as { L?: typeof L }).L = L;
}

// Brașov default center (per spec).
const DEFAULT_CENTER: [number, number] = [45.6427, 25.5887];
const DEFAULT_ZOOM = 12;

type EditControlProps = {
  position: 'topleft' | 'topright' | 'bottomleft' | 'bottomright';
  draw?: Record<string, unknown>;
  edit?: Record<string, unknown>;
  onCreated?: (e: { layer: L.Layer }) => void;
};

// Convert GeoJSON polygon (lng, lat) to Leaflet positions (lat, lng).
function toLatLngs(polygon: Polygon): [number, number][] {
  const ring = polygon.coordinates[0] ?? [];
  return ring.map(([lng, lat]) => [lat, lng]);
}

// Convert Leaflet layer (polygon) back to GeoJSON polygon.
function layerToPolygon(layer: L.Layer): Polygon | null {
  const geo = (layer as L.Polygon).toGeoJSON();
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
  tenantCenter?: { lat: number; lng: number } | null;
};

export function ZoneMap({ zones, selectedId, onSelect, onPolygonDrawn, tenantCenter }: Props) {
  const initialView = useMemo(() => {
    if (tenantCenter) {
      return { center: [tenantCenter.lat, tenantCenter.lng] as [number, number], zoom: 13 };
    }
    return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
  }, [tenantCenter]);

  // Lazy-load leaflet-draw + EditControl after window.L is set above.
  const [EditControl, setEditControl] = useState<ComponentType<EditControlProps> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await import('leaflet-draw');
        const mod = await import('react-leaflet-draw');
        if (!cancelled) {
          setEditControl(() => mod.EditControl as unknown as ComponentType<EditControlProps>);
        }
      } catch (err) {
        console.error('[zone-map] failed to load leaflet-draw', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

      <FeatureGroup>
        {EditControl ? (
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
            onCreated={(e) => {
              const polygon = layerToPolygon(e.layer);
              if (polygon) onPolygonDrawn(polygon);
              (e.layer as L.Layer & { remove?: () => void }).remove?.();
            }}
          />
        ) : null}
      </FeatureGroup>
    </MapContainer>
  );
}
