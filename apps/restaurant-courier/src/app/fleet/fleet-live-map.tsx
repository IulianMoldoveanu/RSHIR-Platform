'use client';

import { useEffect, useRef } from 'react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CourierMarker, { type Vehicle } from '@/components/courier-marker';

// CDN-loaded Leaflet keeps us off the dependency graph (no package.json
// change, no bundle bloat). The shape mirrors RiderMap's loader.

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;

const DEFAULT_CENTER: [number, number] = [45.6427, 25.5887]; // Brașov
const DEFAULT_ZOOM = 12;

type LeafletGlobal = {
  map: (el: HTMLElement, opts?: Record<string, unknown>) => LeafletMap;
  tileLayer: (url: string, opts?: Record<string, unknown>) => LeafletLayer;
  marker: (
    latlng: [number, number],
    opts?: Record<string, unknown>,
  ) => LeafletMarker;
  divIcon: (opts: Record<string, unknown>) => unknown;
  latLngBounds: (corner1: [number, number], corner2: [number, number]) => LeafletBounds;
  layerGroup: () => LeafletLayerGroup;
};
type LeafletMap = {
  setView: (latlng: [number, number], zoom: number) => LeafletMap;
  fitBounds: (b: LeafletBounds, opts?: Record<string, unknown>) => LeafletMap;
  remove: () => void;
  invalidateSize: () => void;
};
type LeafletLayer = { addTo: (map: LeafletMap) => LeafletLayer };
type LeafletLayerGroup = {
  addTo: (map: LeafletMap) => LeafletLayerGroup;
  addLayer: (layer: LeafletMarker) => LeafletLayerGroup;
  clearLayers: () => LeafletLayerGroup;
};
type LeafletMarker = {
  addTo: (map: LeafletMap) => LeafletMarker;
  bindTooltip: (txt: string, opts?: Record<string, unknown>) => LeafletMarker;
};
type LeafletBounds = { extend: (latlng: [number, number]) => LeafletBounds };

// `Window.L` is declared by `rider-map.tsx` already; declaring it again
// here triggers TS2717 ("Subsequent property declarations must have the
// same type") because the two LeafletGlobal types — though structurally
// identical — are distinct named types. Cast through `unknown` at the
// access site instead so this file stays self-contained type-wise.
type WindowWithLeaflet = Window & { L?: unknown };

function loadLeaflet(): Promise<LeafletGlobal> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  const cached = (window as WindowWithLeaflet).L as LeafletGlobal | undefined;
  if (cached) return Promise.resolve(cached);

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
        const lib = (window as WindowWithLeaflet).L as LeafletGlobal | undefined;
        if (lib) resolve(lib);
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
      const lib = (window as WindowWithLeaflet).L as LeafletGlobal | undefined;
      if (lib) resolve(lib);
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
  /** courier_profiles.vehicle_type — defaults to 'bike' when absent. */
  vehicle?: Vehicle;
  /** courier_shifts.last_heading_deg — defaults to 0 when absent. */
  heading?: number;
  /** courier_shifts.last_seen_at — drives the stale-pin degrade so a frozen
   *  position doesn't read as a live one. */
  lastSeenAt?: string | null;
};

// A GPS fix older than this is treated as stale: the pin greys out (even for an
// ONLINE shift) and the tooltip shows the age, so the dispatcher never trusts a
// frozen position as the courier's current location.
const PIN_STALE_MS = 5 * 60_000;

// Compute the bounding box around a set of pins (for fit/recenter).
function boundsForPins(L: LeafletGlobal, pins: FleetRiderPin[]): LeafletBounds | null {
  if (pins.length === 0) return null;
  const bounds = L.latLngBounds([pins[0].lat, pins[0].lng], [pins[0].lat, pins[0].lng]);
  for (const pin of pins) bounds.extend([pin.lat, pin.lng]);
  return bounds;
}

// Repaint the marker layer from the current pins. Crucially this only swaps
// the markers — it never moves the map view, so the dispatcher's manual
// zoom/pan survives the 30s auto-refresh and realtime re-renders. The view is
// fitted exactly once (first non-empty paint, tracked by `didFitRef`). Before
// this, the whole Leaflet instance was torn down + re-fit on every `pins`
// change, which reset the zoom and made the map feel like it couldn't zoom.
function paintPins(
  L: LeafletGlobal,
  map: LeafletMap,
  markers: LeafletLayerGroup,
  pins: FleetRiderPin[],
  didFitRef: React.MutableRefObject<boolean>,
): void {
  markers.clearLayers();
  if (pins.length === 0) return;

  for (const pin of pins) {
    const ageMs = pin.lastSeenAt
      ? Date.now() - new Date(pin.lastSeenAt).getTime()
      : Infinity;
    const isStale = ageMs > PIN_STALE_MS;
    const live = pin.online && !isStale;
    const markerHtml = renderToStaticMarkup(
      React.createElement(CourierMarker, {
        vehicle: pin.vehicle ?? 'bike',
        // Stale fix → greyed (offline-style) even if the shift is ONLINE.
        status: live ? 'online' : 'offline',
        heading: pin.heading ?? 0,
        animate: false,
        size: 32,
      }),
    );
    const icon = L.divIcon({
      className: '',
      html: markerHtml,
      iconSize: [32, 40],
      iconAnchor: [16, 40],
    });
    const ageLabel =
      isStale && Number.isFinite(ageMs) ? ` · acum ${Math.round(ageMs / 60_000)} min` : '';
    const tooltip =
      pin.inProgressCount > 0
        ? `${pin.name} · ${pin.inProgressCount} în curs${ageLabel}`
        : `${pin.name} · ${live ? 'liber' : 'offline'}${ageLabel}`;
    const marker = L.marker([pin.lat, pin.lng], { icon }).bindTooltip(tooltip, {
      direction: 'top',
      offset: [0, -42],
    });
    markers.addLayer(marker);
  }

  if (!didFitRef.current) {
    const bounds = boundsForPins(L, pins);
    if (bounds) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    didFitRef.current = true;
  }
}

/**
 * Mini live-map for the fleet overview. Plots each rider with a known
 * GPS fix: emerald pin if online + idle, violet if online + carrying
 * an active order, zinc if last-seen but currently offline.
 *
 * The Leaflet instance is created ONCE (on mount); the parent Server
 * Component re-runs on router.refresh() (driven by fleet-orders-realtime +
 * the 30s auto-refresh) and re-passes new `pins`, which only swap the marker
 * layer — the map keeps the dispatcher's zoom/pan. "Recentrează" re-fits to
 * all current pins on demand.
 */
export function FleetLiveMap({ pins }: { pins: FleetRiderPin[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<LeafletGlobal | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LeafletLayerGroup | null>(null);
  const didFitRef = useRef(false);
  const cancelledRef = useRef(false);
  // Latest pins, so the (mount-only) init effect can paint whatever arrived
  // while Leaflet was still loading.
  const pinsRef = useRef<FleetRiderPin[]>(pins);
  pinsRef.current = pins;

  // Create the map exactly once.
  useEffect(() => {
    cancelledRef.current = false;

    void loadLeaflet()
      .then((L) => {
        if (cancelledRef.current || !containerRef.current || mapRef.current) return;

        const map = L.map(containerRef.current, {
          zoomControl: true,
          scrollWheelZoom: true,
        }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        const markers = L.layerGroup().addTo(map);

        leafletRef.current = L;
        mapRef.current = map;
        markersRef.current = markers;
        setTimeout(() => map.invalidateSize(), 0);

        paintPins(L, map, markers, pinsRef.current, didFitRef);
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
        markersRef.current = null;
        leafletRef.current = null;
        didFitRef.current = false;
      }
    };
    // Mount-only: the map lives across re-renders. Pin updates are handled by
    // the effect below so the view is never reset out from under the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Repaint markers when pins change — preserves the current zoom/pan.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const markers = markersRef.current;
    // Map not ready yet — the init effect paints the initial pins itself.
    if (!L || !map || !markers) return;
    paintPins(L, map, markers, pins, didFitRef);
  }, [pins]);

  function handleRecenter() {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const bounds = boundsForPins(L, pinsRef.current);
    if (bounds) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    else map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-72 w-full overflow-hidden rounded-2xl border border-hir-border bg-hir-surface"
      />
      {pins.length > 0 ? (
        <button
          type="button"
          onClick={handleRecenter}
          className="absolute right-3 top-3 z-[500] min-h-[36px] rounded-lg border border-hir-border bg-zinc-900/90 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 shadow-md backdrop-blur hover:bg-zinc-800"
        >
          Recentrează
        </button>
      ) : null}
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
