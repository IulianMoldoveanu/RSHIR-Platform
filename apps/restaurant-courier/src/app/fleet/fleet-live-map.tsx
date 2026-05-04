'use client';

import { useEffect, useRef } from 'react';

// CDN-loaded Leaflet keeps us off the dependency graph (no package.json
// change, no bundle bloat). The shape mirrors RiderMap's loader.

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;

const DEFAULT_CENTER: [number, number] = [45.6427, 25.5887]; // Brașov

type LeafletGlobal = {
  map: (el: HTMLElement, opts?: Record<string, unknown>) => LeafletMap;
  tileLayer: (url: string, opts?: Record<string, unknown>) => LeafletLayer;
  marker: (
    latlng: [number, number],
    opts?: Record<string, unknown>,
  ) => LeafletMarker;
  divIcon: (opts: Record<string, unknown>) => unknown;
  latLngBounds: (corner1: [number, number], corner2: [number, number]) => LeafletBounds;
};
type LeafletMap = {
  setView: (latlng: [number, number], zoom: number) => LeafletMap;
  fitBounds: (b: LeafletBounds, opts?: Record<string, unknown>) => LeafletMap;
  remove: () => void;
  invalidateSize: () => void;
};
type LeafletLayer = { addTo: (map: LeafletMap) => LeafletLayer };
type LeafletMarker = {
  addTo: (map: LeafletMap) => LeafletMarker;
  bindTooltip: (txt: string, opts?: Record<string, unknown>) => LeafletMarker;
};
type LeafletBounds = { extend: (latlng: [number, number]) => LeafletBounds };

declare global {
  interface Window {
    L?: LeafletGlobal;
  }
}

function loadLeaflet(): Promise<LeafletGlobal> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.L) return Promise.resolve(window.L);

  if (!document.querySelector(`link[data-rider-map="leaflet-css"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS;
    link.dataset.riderMap = 'leaflet-css';
    document.head.appendChild(link);
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-rider-map="leaflet-js"]`,
    );
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.L) resolve(window.L);
        else reject(new Error('Leaflet loaded but window.L missing'));
      });
      existing.addEventListener('error', () => reject(new Error('Leaflet script load failed')));
      return;
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.async = true;
    script.dataset.riderMap = 'leaflet-js';
    script.onload = () => {
      if (window.L) resolve(window.L);
      else reject(new Error('Leaflet loaded but window.L missing'));
    };
    script.onerror = () => reject(new Error('Leaflet script load failed'));
    document.head.appendChild(script);
  });
}

export type FleetRiderPin = {
  userId: string;
  name: string;
  lat: number;
  lng: number;
  online: boolean;
  inProgressCount: number;
};

/**
 * Mini live-map for the fleet overview. Plots each rider with a known
 * GPS fix: emerald pin if online + idle, violet if online + carrying
 * an active order, zinc if last-seen but currently offline.
 *
 * Only renders pins for riders with a `last_lat`/`last_lng` in the last
 * shift row. We don't poll — the parent Server Component re-runs on
 * router.refresh() (driven by fleet-orders-realtime + manual refresh).
 */
export function FleetLiveMap({ pins }: { pins: FleetRiderPin[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    void loadLeaflet()
      .then((L) => {
        if (cancelledRef.current || !containerRef.current) return;

        const map = L.map(containerRef.current, {
          zoomControl: true,
          // Rider pins are the focal point; tile interaction stays on but
          // the manager rarely needs to scroll a city-wide view.
        }).setView(DEFAULT_CENTER, 12);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        mapRef.current = map;
        setTimeout(() => map.invalidateSize(), 0);

        if (pins.length === 0) return;

        const bounds = L.latLngBounds(
          [pins[0].lat, pins[0].lng],
          [pins[0].lat, pins[0].lng],
        );

        for (const pin of pins) {
          // Color: violet when actively carrying ≥1 order, emerald when
          // online + free, zinc when offline (last known position only).
          const color = pin.online
            ? pin.inProgressCount > 0
              ? '#7c3aed'
              : '#10b981'
            : '#52525b';
          const ring = pin.online ? `0 0 0 6px ${color}40` : 'none';
          const icon = L.divIcon({
            className: 'fleet-rider-pin',
            html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid #ffffff;box-shadow:${ring}, 0 1px 3px rgba(0,0,0,0.5)"></span>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          });
          const tooltip =
            pin.inProgressCount > 0
              ? `${pin.name} · ${pin.inProgressCount} în curs`
              : `${pin.name} · ${pin.online ? 'liber' : 'offline'}`;
          L.marker([pin.lat, pin.lng], { icon })
            .bindTooltip(tooltip, { direction: 'top', offset: [0, -10] })
            .addTo(map);
          bounds.extend([pin.lat, pin.lng]);
        }

        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      })
      .catch((err) => {
        if (!cancelledRef.current) {
          console.error('[fleet-live-map] failed to init', err);
        }
      });

    return () => {
      cancelledRef.current = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // pins deliberately not in deps — when pins change, the parent route
    // re-renders the whole component, which unmounts + remounts the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-72 w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900"
      />
      {pins.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-zinc-950/60 p-6 text-center backdrop-blur-sm">
          <p className="max-w-xs text-xs text-zinc-400">
            Niciun curier nu are locație înregistrată încă. Pornește o tură pe
            un cont de test pentru a vedea pin-uri pe hartă.
          </p>
        </div>
      ) : null}
    </div>
  );
}
