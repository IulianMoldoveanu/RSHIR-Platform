'use client';

import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Polygon as LeafletPolygon, useMap } from 'react-leaflet';
import type { Zone, Polygon } from './types';

// leaflet-draw is a UMD plugin that augments window.L. Set it before any
// dynamic import below so the plugin's module body finds the global it
// expects. Bare `import 'leaflet-draw'` at top-level breaks here because
// some build pipelines evaluate it before this assignment runs.
if (typeof window !== 'undefined') {
  (window as unknown as { L?: typeof L }).L = L;
}

const DEFAULT_CENTER: [number, number] = [45.6427, 25.5887];
const DEFAULT_ZOOM = 12;

function toLatLngs(polygon: Polygon): [number, number][] {
  const ring = polygon.coordinates[0] ?? [];
  return ring.map(([lng, lat]) => [lat, lng]);
}

type DrawCreatedEvent = { layer: L.Layer & { toGeoJSON: () => GeoJSON.Feature; remove?: () => void } };

type LeafletWithDraw = typeof L & {
  Control: typeof L.Control & {
    Draw: new (options: Record<string, unknown>) => L.Control;
  };
  Draw: { Event: { CREATED: string } };
};

// Inner control component: uses react-leaflet's useMap to grab the map
// instance, then attaches a leaflet-draw L.Control.Draw to it. We bypass
// react-leaflet-draw entirely because that package statically imports
// leaflet-draw at module load and is chunked together with leaflet,
// which can race the window.L assignment in some bundles.
function DrawPolygonControl({ onCreated }: { onCreated: (polygon: Polygon) => void }) {
  const map = useMap();

  useEffect(() => {
    let control: L.Control | null = null;
    let drawn: L.FeatureGroup | null = null;
    let created: ((e: DrawCreatedEvent) => void) | null = null;
    let cancelled = false;

    void (async () => {
      await import('leaflet-draw');
      if (cancelled) return;
      const Lx = L as LeafletWithDraw;

      drawn = new Lx.FeatureGroup();
      map.addLayer(drawn);

      control = new Lx.Control.Draw({
        position: 'topleft',
        edit: { featureGroup: drawn, edit: false, remove: false },
        draw: {
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
        },
      });
      map.addControl(control);

      created = (e: DrawCreatedEvent) => {
        const geo = e.layer.toGeoJSON() as { geometry?: { type: string; coordinates: number[][][] } };
        if (geo.geometry?.type === 'Polygon') {
          onCreated({
            type: 'Polygon',
            coordinates: geo.geometry.coordinates as [number, number][][],
          });
        }
        e.layer.remove?.();
      };
      map.on(Lx.Draw.Event.CREATED, created as unknown as L.LeafletEventHandlerFn);
    })();

    return () => {
      cancelled = true;
      if (created) {
        map.off((L as LeafletWithDraw).Draw?.Event.CREATED, created as unknown as L.LeafletEventHandlerFn);
      }
      if (control) map.removeControl(control);
      if (drawn) map.removeLayer(drawn);
    };
  }, [map, onCreated]);

  return null;
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

      <DrawPolygonControl onCreated={onPolygonDrawn} />
    </MapContainer>
  );
}
