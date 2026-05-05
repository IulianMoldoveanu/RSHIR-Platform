'use client';

import { useEffect, useRef, useState } from 'react';
import { vehicleIconHtml, type VehicleType as VehicleIconType } from './vehicle-icon';

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

// Local copies — duplicated rather than imported because rider-map.tsx is a
// 'use client' module and we want to avoid pulling a shared lib that could
// drag server-only code into the client bundle.
function haversineMetersLocal(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Initial bearing in degrees from p1 to p2 (clockwise from true north).
function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  const brng = Math.atan2(y, x);
  return (toDeg(brng) + 360) % 360;
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

// Re-export the shared type so existing call sites typed against
// `RiderMap`'s VehicleType keep working without code changes.
export type VehicleType = VehicleIconType;

type ActivePin = {
  orderId: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
};

// CSS keyframes for the pulse halo. Injected once per page the first time
// `makeRiderIcon` is called. Wolt / Glovo / Uber Eats markers are stacked:
//   1. Animated outer pulse (continuous "I'm live" pulse),
//   2. Accuracy ring (semi-transparent — sized loosely by GPS accuracy),
//   3. White halo (separates the vehicle silhouette from the map tile),
//   4. The 3D vehicle SVG, rotated by the live heading.
const RIDER_PIN_STYLE_ID = 'rider-vehicle-pin-styles';
function ensureRiderPinStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(RIDER_PIN_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = RIDER_PIN_STYLE_ID;
  style.textContent = `
    @keyframes rider-pin-pulse {
      0%   { transform: scale(0.55); opacity: 0.55; }
      80%  { transform: scale(2.1); opacity: 0; }
      100% { transform: scale(2.1); opacity: 0; }
    }
    .rider-vehicle-pin .rider-pulse {
      animation: rider-pin-pulse 1.6s ease-out infinite;
      transform-origin: center;
    }
    .rider-vehicle-pin .rider-rotor {
      transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1);
      transform-origin: center;
      will-change: transform;
    }
    .rider-vehicle-pin .rider-accuracy {
      transition: inset 400ms cubic-bezier(0.4, 0, 0.2, 1);
    }
  `;
  document.head.appendChild(style);
}

// Builds the divIcon HTML wrapping the 3D miniature SVG. The wrapper has
// stacked layers: pulse → accuracy ring → halo → vehicle (rotor). We
// query the rotor + accuracy elements back from the DOM to rotate the
// vehicle and resize the accuracy ring without forcing Leaflet to
// re-render the whole marker on every fix.
function makeRiderIcon(L: LeafletGlobal, type: VehicleType): unknown {
  ensureRiderPinStyles();
  const inner = vehicleIconHtml(type);
  return L.divIcon({
    className: 'rider-vehicle-pin',
    html: `<div style="position:relative;width:56px;height:56px;">
      <div class="rider-pulse" style="position:absolute;inset:0;border-radius:9999px;background:rgba(124,58,237,0.45);pointer-events:none;"></div>
      <div class="rider-accuracy" data-rider-accuracy="1" style="position:absolute;inset:2px;border-radius:9999px;background:rgba(124,58,237,0.18);border:1px solid rgba(124,58,237,0.45);pointer-events:none;"></div>
      <div style="position:absolute;inset:6px;border-radius:9999px;background:#ffffff;box-shadow:0 0 0 2px rgba(124,58,237,0.55), 0 6px 14px rgba(0,0,0,0.40);"></div>
      <div class="rider-rotor" data-rider-rotor="1" style="position:absolute;inset:8px;display:flex;align-items:center;justify-content:center;border-radius:9999px;overflow:hidden;background:radial-gradient(circle at 30% 25%, rgba(167,139,250,0.20), rgba(124,58,237,0.05) 70%);">${inner}</div>
    </div>`,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
  });
}

// Helpers: find the rotor + accuracy ring inside a Leaflet marker DOM
// node. We use data attributes rather than class names because Leaflet
// may inject its own classes/transforms on the outer marker icon.
function getMarkerRotorEl(marker: LeafletMarker): HTMLElement | null {
  const m = marker as unknown as { getElement?: () => HTMLElement | null };
  const el = m.getElement?.();
  if (!el) return null;
  return el.querySelector<HTMLElement>('[data-rider-rotor="1"]');
}
function getMarkerAccuracyEl(marker: LeafletMarker): HTMLElement | null {
  const m = marker as unknown as { getElement?: () => HTMLElement | null };
  const el = m.getElement?.();
  if (!el) return null;
  return el.querySelector<HTMLElement>('[data-rider-accuracy="1"]');
}

// Map raw GPS accuracy (meters) to a CSS inset for the accuracy ring.
// The wrapper is 56 px so the ring shrinks/expands over a small range —
// it's a visual hint, not a metrically scaled radius. Wolt uses the
// same pattern: tighter ring when GPS is sharp, wider when it's fuzzy.
function accuracyInsetPx(accuracyMeters: number | null | undefined): number {
  if (accuracyMeters == null || !Number.isFinite(accuracyMeters)) return 4;
  if (accuracyMeters <= 15) return 6;
  if (accuracyMeters <= 50) return 4;
  if (accuracyMeters <= 150) return 2;
  return 0;
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

        // Active-order layer: pickup + dropoff rendered as Wolt-style
        // stylized "drop" pins (coloured circle with a glyph + a small
        // tail pointing at the actual coordinate), connected by a
        // dashed polyline so the rider sees the route at a glance.
        // Straight lines for MVP — switching to OSRM-fetched paths is
        // a follow-up (per maps-geo-dev tickets).
        const dropPinHtml = (color: string, glyph: string): string => `
          <div style="position:relative;width:32px;height:40px;">
            <div style="position:absolute;left:50%;top:0;transform:translateX(-50%);width:32px;height:32px;border-radius:9999px;background:${color};border:2.5px solid #ffffff;box-shadow:0 4px 10px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;">${glyph}</div>
            <div style="position:absolute;left:50%;top:26px;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:14px solid ${color};filter:drop-shadow(0 2px 2px rgba(0,0,0,0.35));"></div>
          </div>
        `;
        const polyBounds: Array<[number, number]> = [];
        for (const pin of activePins) {
          if (pin.pickupLat != null && pin.pickupLng != null) {
            polyBounds.push([pin.pickupLat, pin.pickupLng]);
            L.marker([pin.pickupLat, pin.pickupLng], {
              icon: L.divIcon({
                className: 'rider-pickup-pin',
                html: dropPinHtml('#7c3aed', '📦'),
                iconSize: [32, 40],
                iconAnchor: [16, 40],
              }),
            }).addTo(map);
          }
          if (pin.dropoffLat != null && pin.dropoffLng != null) {
            polyBounds.push([pin.dropoffLat, pin.dropoffLng]);
            L.marker([pin.dropoffLat, pin.dropoffLng], {
              icon: L.divIcon({
                className: 'rider-dropoff-pin',
                html: dropPinHtml('#10b981', '🏠'),
                iconSize: [32, 40],
                iconAnchor: [16, 40],
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

        // Track last-known heading so the icon stays oriented even when the
        // device is briefly stationary (heading goes null at speed 0).
        let lastHeadingDeg: number | null = null;
        let lastLat: number | null = null;
        let lastLng: number | null = null;

        // GPS interpolation state — Wolt's marker doesn't snap on each
        // fix, it eases between the previous and the new coordinate over
        // ~600 ms. We drive the easing with rAF, cancel any in-flight
        // animation when a new fix arrives, and fall back to setLatLng
        // jumps for identical points.
        const INTERPOLATE_MS = 600;
        let animationFrameId: number | null = null;
        const cancelInterpolation = () => {
          if (animationFrameId != null) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
          }
        };

        const id = navigator.geolocation.watchPosition(
          (pos) => {
            if (cancelledRef.current) return;
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const accuracyMeters = pos.coords.accuracy;
            setPermission('granted');

            // Heading: prefer the device-reported value when present
            // (mobile GPS at speed). Fall back to a derived bearing from
            // consecutive points so the icon still turns when only
            // crowdsourced wifi/cell positioning is available.
            //
            // iOS Safari quirk: returns heading = -1 when stationary.
            // We guard against that explicitly so the icon doesn't snap
            // to "south" while the rider is at a light. Also require
            // speed > 0 so a noisy stationary fix doesn't update heading.
            let nextHeading: number | null = null;
            const reportedHeading = pos.coords.heading;
            const reportedSpeed = pos.coords.speed;
            const speedTrustworthy =
              typeof reportedSpeed === 'number' && Number.isFinite(reportedSpeed) && reportedSpeed > 0;
            if (
              typeof reportedHeading === 'number' &&
              Number.isFinite(reportedHeading) &&
              reportedHeading >= 0 &&
              reportedHeading <= 360 &&
              (speedTrustworthy || reportedSpeed === null)
            ) {
              nextHeading = reportedHeading;
            } else if (lastLat != null && lastLng != null) {
              const moved = haversineMetersLocal(lastLat, lastLng, lat, lng);
              if (moved > 5) {
                nextHeading = bearingDeg(lastLat, lastLng, lat, lng);
              }
            }
            if (nextHeading != null) lastHeadingDeg = nextHeading;

            // Capture previous coords BEFORE overwriting `lastLat`/`lastLng`
            // so the interpolation has a real start point to ease from.
            const prevLat = lastLat;
            const prevLng = lastLng;
            lastLat = lat;
            lastLng = lng;

            // First fix → just place the marker; subsequent fixes →
            // animate from the previous lat/lng to the new one over
            // INTERPOLATE_MS so the icon glides instead of snapping.
            if (!markerRef.current) {
              const icon = makeRiderIcon(L, vehicleType);
              markerRef.current = L.marker([lat, lng], { icon }).addTo(map);
              if (polyBounds.length < 2) map.setView([lat, lng], RIDER_ZOOM);
            } else {
              cancelInterpolation();
              const startLat = prevLat ?? lat;
              const startLng = prevLng ?? lng;
              if (startLat === lat && startLng === lng) {
                markerRef.current.setLatLng([lat, lng]);
              } else {
                const startTs = performance.now();
                const step = () => {
                  if (cancelledRef.current || !markerRef.current) {
                    animationFrameId = null;
                    return;
                  }
                  const elapsed = performance.now() - startTs;
                  const t = Math.min(1, elapsed / INTERPOLATE_MS);
                  const easedT = 1 - (1 - t) * (1 - t); // ease-out quad
                  const curLat = startLat + (lat - startLat) * easedT;
                  const curLng = startLng + (lng - startLng) * easedT;
                  markerRef.current.setLatLng([curLat, curLng]);
                  if (t < 1) {
                    animationFrameId = requestAnimationFrame(step);
                  } else {
                    animationFrameId = null;
                  }
                };
                animationFrameId = requestAnimationFrame(step);
              }
            }

            // Apply rotation on the rotor div + accuracy ring inset on
            // the accuracy div. Wait for the next frame so Leaflet has
            // attached the marker DOM after addTo.
            requestAnimationFrame(() => {
              if (!markerRef.current) return;
              if (lastHeadingDeg != null) {
                const rotor = getMarkerRotorEl(markerRef.current);
                if (rotor) rotor.style.transform = `rotate(${lastHeadingDeg}deg)`;
              }
              const accuracy = getMarkerAccuracyEl(markerRef.current);
              if (accuracy) {
                const inset = accuracyInsetPx(accuracyMeters);
                accuracy.style.inset = `${inset}px`;
              }
            });
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
