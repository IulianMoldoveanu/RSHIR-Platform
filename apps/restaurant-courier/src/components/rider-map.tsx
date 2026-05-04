'use client';

import { useEffect, useRef, useState } from 'react';

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_ROTATE_VERSION = '0.2.8';
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_ROTATE_JS = `https://unpkg.com/leaflet-rotate@${LEAFLET_ROTATE_VERSION}/dist/leaflet-rotate-src.js`;

const FALLBACK_CENTER: [number, number] = [45.6427, 25.5887];
const FALLBACK_ZOOM = 12;
const RIDER_ZOOM = 15;

type LeafletGlobal = {
  map: (el: HTMLElement, opts?: Record<string, unknown>) => LeafletMap;
  tileLayer: (url: string, opts?: Record<string, unknown>) => LeafletLayer;
  marker: (
    latlng: [number, number],
    opts?: Record<string, unknown>,
  ) => LeafletMarker;
  divIcon: (opts: Record<string, unknown>) => unknown;
  polyline: (
    latlngs: Array<[number, number]>,
    opts?: Record<string, unknown>,
  ) => LeafletLayer;
  latLngBounds: (
    latlngs: Array<[number, number]>,
  ) => { isValid: () => boolean; pad: (n: number) => unknown };
};

type LeafletMap = {
  setView: (latlng: [number, number], zoom: number) => LeafletMap;
  remove: () => void;
  invalidateSize: () => void;
  fitBounds: (bounds: unknown, opts?: Record<string, unknown>) => LeafletMap;
  setBearing?: (angleDeg: number) => LeafletMap;
};

type LeafletLayer = {
  addTo: (map: LeafletMap) => LeafletLayer;
  remove?: () => void;
};

type LeafletMarker = {
  addTo: (map: LeafletMap) => LeafletMarker;
  setLatLng: (latlng: [number, number]) => LeafletMarker;
  setIcon?: (icon: unknown) => LeafletMarker;
};

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

// leaflet-rotate is a small (~6 KB gzipped) plugin that monkey-patches L.Map
// to add rotation support — including a native two-finger touch-rotate
// gesture (matching iOS/Android map UX). Loads after leaflet itself and
// extends the same window.L global. If the plugin fails (CDN flake, ad
// blocker), the map still works without rotation — graceful degrade.
function loadLeafletRotate(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    if (document.querySelector(`script[data-rider-map="leaflet-rotate"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = LEAFLET_ROTATE_JS;
    script.async = true;
    script.dataset.riderMap = 'leaflet-rotate';
    script.onload = () => resolve();
    script.onerror = () => resolve(); // graceful: map still works, just no rotation
    document.head.appendChild(script);
  });
}

type Permission = 'pending' | 'granted' | 'denied' | 'unsupported' | 'error';

export type VehicleType = 'BIKE' | 'SCOOTER' | 'CAR';

type ActivePin = {
  orderId: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
};

// Inline SVGs for the rider's own marker. Sized at 36×36 so they read on
// mobile without overpowering the map. Strokes are bright violet on a white
// fill so they remain legible against tile colors. The `transform-origin`
// keeps the icon centered when the map is rotated.
function riderIconSvg(type: VehicleType): string {
  const base = 'width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
  // Bike: two wheels + frame triangle.
  const bike = `<svg xmlns="http://www.w3.org/2000/svg" ${base}>
    <circle cx="5.5" cy="17.5" r="3.5" fill="#ffffff"/>
    <circle cx="18.5" cy="17.5" r="3.5" fill="#ffffff"/>
    <path d="M5.5 17.5L8 7l5 0 4 10.5"/>
    <path d="M13 7h3"/>
  </svg>`;
  // Scooter: small wheel + body + handlebar.
  const scooter = `<svg xmlns="http://www.w3.org/2000/svg" ${base}>
    <circle cx="6" cy="18" r="3" fill="#ffffff"/>
    <circle cx="18" cy="18" r="3" fill="#ffffff"/>
    <path d="M6 18l3-9h6l3 9"/>
    <path d="M9 9V6h3" />
  </svg>`;
  // Car: top-down silhouette so the icon makes sense even when map is
  // rotated. Front of the car points up by default; rotation aligns with
  // the rider's bearing when we have one.
  const car = `<svg xmlns="http://www.w3.org/2000/svg" ${base}>
    <rect x="6" y="3" width="12" height="18" rx="3" fill="#ffffff"/>
    <path d="M9 3v4h6V3"/>
    <path d="M9 17v4h6v-4"/>
    <circle cx="6" cy="9" r="0.8" fill="#7c3aed"/>
    <circle cx="18" cy="9" r="0.8" fill="#7c3aed"/>
  </svg>`;
  if (type === 'BIKE') return bike;
  if (type === 'SCOOTER') return scooter;
  return car;
}

function makeRiderIcon(L: LeafletGlobal, type: VehicleType): unknown {
  return L.divIcon({
    className: 'rider-vehicle-pin',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:9999px;background:rgba(124,58,237,0.18);box-shadow:0 0 0 4px rgba(124,58,237,0.28);">${riderIconSvg(type)}</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

export function RiderMap({
  fillParent = false,
  activePins = [],
  vehicleType = 'BIKE',
}: {
  /** When true, the map fills its parent's height instead of `calc(100vh-14rem)`. */
  fillParent?: boolean;
  /** Optional pickup/dropoff markers for the rider's active orders. */
  activePins?: ActivePin[];
  /** Drives the rider's own-marker icon (bike / scooter / car). */
  vehicleType?: VehicleType;
} = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const [permission, setPermission] = useState<Permission>('pending');

  useEffect(() => {
    cancelledRef.current = false;

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setPermission('unsupported');
      return;
    }

    void loadLeaflet()
      .then(async (L) => {
        if (cancelledRef.current || !containerRef.current) return;
        // Try to load the rotation plugin. Failure is non-fatal — the map
        // simply renders without rotation support.
        await loadLeafletRotate();

        const map = L.map(containerRef.current, {
          zoomControl: true,
          // leaflet-rotate hooks: enables two-finger touch rotate, plus a
          // small rotate-control corner widget. Both flags are no-ops when
          // the plugin failed to load.
          rotate: true,
          rotateControl: { closeOnZeroBearing: false },
          touchRotate: true,
          bearing: 0,
        }).setView(FALLBACK_CENTER, FALLBACK_ZOOM);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        mapRef.current = map;

        // Active-order layer: for each pin we paint the pickup (violet),
        // the dropoff (emerald), and a dashed polyline connecting them so
        // the rider sees the route at a glance. We use straight lines for
        // MVP — switching to OSRM-fetched paths is a follow-up that needs
        // the routing service plumbed in (per maps-geo-dev tickets).
        const polyBounds: Array<[number, number]> = [];
        for (const pin of activePins) {
          if (pin.pickupLat != null && pin.pickupLng != null) {
            polyBounds.push([pin.pickupLat, pin.pickupLng]);
            L.marker([pin.pickupLat, pin.pickupLng], {
              icon: L.divIcon({
                className: 'rider-pickup-pin',
                html:
                  '<span style="display:block;width:14px;height:14px;border-radius:9999px;background:#7c3aed;border:2px solid #ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.5)"></span>',
                iconSize: [14, 14],
                iconAnchor: [7, 7],
              }),
            }).addTo(map);
          }
          if (pin.dropoffLat != null && pin.dropoffLng != null) {
            polyBounds.push([pin.dropoffLat, pin.dropoffLng]);
            L.marker([pin.dropoffLat, pin.dropoffLng], {
              icon: L.divIcon({
                className: 'rider-dropoff-pin',
                html:
                  '<span style="display:block;width:14px;height:14px;border-radius:9999px;background:#10b981;border:2px solid #ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.5)"></span>',
                iconSize: [14, 14],
                iconAnchor: [7, 7],
              }),
            }).addTo(map);
          }
          if (
            pin.pickupLat != null &&
            pin.pickupLng != null &&
            pin.dropoffLat != null &&
            pin.dropoffLng != null
          ) {
            L.polyline(
              [
                [pin.pickupLat, pin.pickupLng],
                [pin.dropoffLat, pin.dropoffLng],
              ],
              {
                color: '#7c3aed',
                weight: 3,
                opacity: 0.65,
                dashArray: '6 8',
              },
            ).addTo(map);
          }
        }

        // If we have at least 2 distinct points, fit the map to show them
        // all with a small padding. Otherwise the watchPosition handler
        // below will recenter on the rider's first GPS fix.
        if (polyBounds.length >= 2) {
          try {
            const bounds = L.latLngBounds(polyBounds);
            if (bounds.isValid()) {
              map.fitBounds(bounds.pad(0.25), {});
            }
          } catch {
            /* ignore — fallback to default view */
          }
        }

        // Some layouts mount the map inside a flex parent that resizes
        // after first paint; force a resize so tiles fill correctly.
        setTimeout(() => map.invalidateSize(), 0);

        const id = navigator.geolocation.watchPosition(
          (pos) => {
            if (cancelledRef.current) return;
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            setPermission('granted');

            if (markerRef.current) {
              markerRef.current.setLatLng([lat, lng]);
            } else {
              const icon = makeRiderIcon(L, vehicleType);
              markerRef.current = L.marker([lat, lng], { icon }).addTo(map);
              if (polyBounds.length < 2) map.setView([lat, lng], RIDER_ZOOM);
            }
          },
          (err) => {
            if (err.code === err.PERMISSION_DENIED) {
              setPermission('denied');
            } else {
              setPermission('error');
              console.warn('[rider-map] watchPosition error', err.code, err.message);
            }
          },
          {
            enableHighAccuracy: false,
            maximumAge: 15_000,
            timeout: 20_000,
          },
        );
        watchIdRef.current = id;
      })
      .catch((err) => {
        if (!cancelledRef.current) {
          setPermission('error');
          console.error('[rider-map] failed to init', err);
        }
      });

    return () => {
      cancelledRef.current = true;
      if (watchIdRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerRef.current = null;
    };
    // We intentionally re-init when activePins or vehicleType change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(activePins), vehicleType]);

  // Fill-parent mode: caller controls height (used by the home dashboard
  // where the map should bleed under the bottom-nav). Default keeps the
  // legacy "card on a page" rounded look for any other call sites.
  const containerClass = fillParent
    ? 'h-full w-full overflow-hidden bg-zinc-900'
    : 'h-[calc(100vh-14rem)] min-h-[420px] w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900';
  const wrapperClass = fillParent ? 'relative h-full w-full' : 'relative';

  return (
    <div className={wrapperClass}>
      <div ref={containerRef} className={containerClass} />

      <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-zinc-700 bg-zinc-950/85 px-3 py-1.5 text-[11px] font-medium text-zinc-300 backdrop-blur">
        <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400 align-middle" />
        În așteptare comandă
      </div>

      {permission === 'denied' && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-zinc-950/80 p-6 text-center backdrop-blur-sm">
          <div className="max-w-xs">
            <p className="text-sm font-semibold text-zinc-100">Locația este dezactivată</p>
            <p className="mt-2 text-xs text-zinc-400">
              Activează permisiunile de locație pentru a vedea harta și a primi comenzi din apropiere.
            </p>
          </div>
        </div>
      )}

      {permission === 'unsupported' && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-zinc-950/80 p-6 text-center">
          <p className="text-xs text-zinc-400">Browserul nu suportă geolocalizarea.</p>
        </div>
      )}
    </div>
  );
}
