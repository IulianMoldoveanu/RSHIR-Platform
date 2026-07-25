'use client';

import { useEffect, useRef } from 'react';

// CDN-loaded Leaflet, same pattern as fleet-live-map.tsx — no bundle bloat,
// no new dependency. Kept as a separate component (not a shared map) because
// this one plots ORDER dropoffs (where deliveries are going), while
// FleetLiveMap plots RIDER positions — different data, different purpose,
// and conflating them would make both harder to reason about.

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;

// Brașov city center. 20km radius is drawn around it so the dispatcher sees
// at a glance which orders fall outside the usual delivery zone.
const BRASOV_CENTER: [number, number] = [45.6427, 25.5887];
const RADIUS_METERS = 20_000;

type LeafletGlobal = {
  map: (el: HTMLElement, opts?: Record<string, unknown>) => LeafletMap;
  tileLayer: (url: string, opts?: Record<string, unknown>) => LeafletLayer;
  marker: (latlng: [number, number], opts?: Record<string, unknown>) => LeafletMarker;
  circle: (latlng: [number, number], opts?: Record<string, unknown>) => LeafletLayer;
  divIcon: (opts: Record<string, unknown>) => unknown;
};
type LeafletMap = {
  setView: (latlng: [number, number], zoom: number) => LeafletMap;
  remove: () => void;
  invalidateSize: () => void;
};
type LeafletLayer = { addTo: (map: LeafletMap) => LeafletLayer };
type LeafletMarker = {
  addTo: (map: LeafletMap) => LeafletMarker;
  bindTooltip: (txt: string, opts?: Record<string, unknown>) => LeafletMarker;
};

// Same rationale as fleet-live-map.tsx: cast through unknown instead of
// re-declaring `Window.L` to avoid the TS2717 duplicate-declaration clash.
type WindowWithLeaflet = Window & { L?: unknown };

function loadLeaflet(): Promise<LeafletGlobal> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  const cached = (window as WindowWithLeaflet).L as LeafletGlobal | undefined;
  if (cached) return Promise.resolve(cached);

  if (!document.querySelector(`link[data-fleet-orders-map="leaflet-css"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS;
    link.dataset.fleetOrdersMap = 'leaflet-css';
    document.head.appendChild(link);
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-fleet-orders-map="leaflet-js"], script[data-rider-map="leaflet-js"]`,
    );
    if (existing) {
      const lib = (window as WindowWithLeaflet).L as LeafletGlobal | undefined;
      if (lib) return resolve(lib);
      existing.addEventListener('load', () => {
        const loaded = (window as WindowWithLeaflet).L as LeafletGlobal | undefined;
        if (loaded) resolve(loaded);
        else reject(new Error('Leaflet loaded but window.L missing'));
      });
      existing.addEventListener('error', () => reject(new Error('Leaflet script load failed')));
      return;
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.async = true;
    script.dataset.fleetOrdersMap = 'leaflet-js';
    script.onload = () => {
      const lib = (window as WindowWithLeaflet).L as LeafletGlobal | undefined;
      if (lib) resolve(lib);
      else reject(new Error('Leaflet loaded but window.L missing'));
    };
    script.onerror = () => reject(new Error('Leaflet script load failed'));
    document.head.appendChild(script);
  });
}

export type OrderMapPin = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  assigned: boolean;
};

/**
 * Brașov + 20km map showing where open/active orders are headed (dropoff
 * pins). Unassigned orders render amber, assigned ones violet — matching
 * the SLA-aging color language already used on the order rows.
 */
export function FleetOrdersMap({ pins }: { pins: OrderMapPin[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    void loadLeaflet()
      .then((L) => {
        if (cancelledRef.current || !containerRef.current) return;

        const map = L.map(containerRef.current, { zoomControl: true }).setView(BRASOV_CENTER, 11);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        L.circle(BRASOV_CENTER, {
          radius: RADIUS_METERS,
          color: '#8b5cf6',
          weight: 1,
          fillOpacity: 0.04,
        }).addTo(map);

        mapRef.current = map;
        setTimeout(() => map.invalidateSize(), 0);

        for (const pin of pins) {
          const color = pin.assigned ? '#8b5cf6' : '#f59e0b';
          const icon = L.divIcon({
            className: '',
            html: `<div style="width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          });
          L.marker([pin.lat, pin.lng], { icon })
            .bindTooltip(pin.label, { direction: 'top', offset: [0, -10] })
            .addTo(map);
        }
      })
      .catch((err) => {
        if (!cancelledRef.current) console.error('[fleet-orders-map] failed to init', err);
      });

    return () => {
      cancelledRef.current = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [pins]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-64 w-full overflow-hidden rounded-2xl border border-hir-border bg-hir-surface"
      />
      {pins.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-zinc-950/60 p-6 text-center backdrop-blur-sm">
          <p className="max-w-xs text-xs text-zinc-400">
            Nicio comandă activă cu adresă de livrare cunoscută.
          </p>
        </div>
      ) : null}
    </div>
  );
}
