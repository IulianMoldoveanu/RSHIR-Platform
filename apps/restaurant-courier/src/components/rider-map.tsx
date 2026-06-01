'use client';

import { useEffect, useRef, useState } from 'react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { type VehicleType as VehicleIconType } from './vehicle-icon';
import CourierMarker, { type Vehicle } from './courier-marker';

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_ROTATE_VERSION = '0.2.8';
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_ROTATE_JS = `https://unpkg.com/leaflet-rotate@${LEAFLET_ROTATE_VERSION}/dist/leaflet-rotate-src.js`;

const FALLBACK_CENTER: [number, number] = [45.6427, 25.5887];
const FALLBACK_ZOOM = 12;
const RIDER_ZOOM = 15;

// localStorage key for last-known GPS position.
const LAST_POS_KEY = 'hir.courier.lastPos';

type StoredPos = { lat: number; lng: number; ts: number };

function saveLastPos(lat: number, lng: number): void {
  try {
    localStorage.setItem(LAST_POS_KEY, JSON.stringify({ lat, lng, ts: Date.now() }));
  } catch {
    // private mode — silent
  }
}

function loadLastPos(): StoredPos | null {
  try {
    const raw = localStorage.getItem(LAST_POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as unknown;
    if (
      typeof p === 'object' &&
      p !== null &&
      typeof (p as StoredPos).lat === 'number' &&
      typeof (p as StoredPos).lng === 'number' &&
      typeof (p as StoredPos).ts === 'number'
    ) {
      return p as StoredPos;
    }
  } catch {
    // parse error — ignore
  }
  return null;
}

function clearLastPos(): void {
  try {
    localStorage.removeItem(LAST_POS_KEY);
  } catch {
    // silent
  }
}

/** Human-friendly age string for the fallback marker tooltip. */
function ageLabel(ts: number): string {
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec} sec`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h`;
}

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
  invalidateSize: (opts?: { animate?: boolean; pan?: boolean }) => void;
  fitBounds: (bounds: unknown, opts?: Record<string, unknown>) => LeafletMap;
  setBearing?: (angleDeg: number) => LeafletMap;
  flyTo?: (
    latlng: [number, number],
    zoom?: number,
    opts?: { duration?: number; easeLinearity?: number },
  ) => LeafletMap;
};

type LeafletLayer = {
  addTo: (map: LeafletMap) => LeafletLayer;
  remove?: () => void;
};

type LeafletMarker = {
  addTo: (map: LeafletMap) => LeafletMarker;
  setLatLng: (latlng: [number, number]) => LeafletMarker;
  getLatLng: () => { lat: number; lng: number };
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

// Map VehicleType (BIKE / SCOOTER / CAR) to CourierMarker Vehicle (bike / moto / car).
function toMarkerVehicle(type: VehicleType): Vehicle {
  if (type === 'CAR') return 'car';
  if (type === 'SCOOTER') return 'moto';
  return 'bike';
}

// Build a Leaflet divIcon from CourierMarker. Heading is embedded in the
// SVG (the directional wedge rotates), so we rebuild the icon on each fix
// when heading changes rather than DOM-patching a rotor element.
// animate=true: single rider marker deserves the pulse halo.
function makeRiderIcon(L: LeafletGlobal, type: VehicleType, heading: number): unknown {
  const html = renderToStaticMarkup(
    React.createElement(CourierMarker, {
      vehicle: toMarkerVehicle(type),
      status: 'online',
      heading,
      animate: true,
      size: 64,
    }),
  );
  return L.divIcon({
    className: '',
    html,
    iconSize: [64, 80],
    iconAnchor: [32, 80],
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
  const fallbackMarkerRef = useRef<LeafletMarker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  // rAF id of the in-flight GPS interpolation. Lives on a ref so the
  // useEffect cleanup can cancel it across re-runs — without this, a
  // running `step()` closure from the previous effect would resume after
  // the fresh effect resets `cancelledRef` and shove the new marker
  // toward stale coordinates for up to ~600 ms (Codex review on #275).
  const animationFrameIdRef = useRef<number | null>(null);
  // Last fix received from watchPosition — surfaced to the recenter
  // button so a tap can fly the map back to the rider's pin without
  // waiting for a brand-new getCurrentPosition round trip.
  const lastFixRef = useRef<{ lat: number; lng: number } | null>(null);
  const [permission, setPermission] = useState<Permission>('pending');
  const [recentering, setRecentering] = useState(false);

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

        // React 18 strict-mode + the async loadLeaflet() chain can race a
        // prior mount's L.map() against the next mount, leaving the
        // container with a `_leaflet_id` from the dead instance. The next
        // L.map(...) then throws "Map container is already initialized."
        // and the dashboard error boundary swallows the whole page.
        // Detach any stale id so init starts on a clean container.
        const container = containerRef.current as HTMLDivElement & {
          _leaflet_id?: number | null;
        };
        if (container._leaflet_id != null) {
          delete container._leaflet_id;
        }

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

        // CARTO Dark Matter tiles — free, no API key, dark theme that matches
        // the courier app's surface. Retina @2x for sharp rendering on phone
        // displays. Falls back to standard tiles when @2x not available.
        // Attribution-required per CARTO's basemap terms.
        L.tileLayer(
          'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
          {
            maxZoom: 19,
            subdomains: 'abcd',
            // detectRetina toggles {r} between '' and '@2x' so HiDPI phones
            // get crisp tiles without forcing them on slow networks.
            detectRetina: true,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          },
        ).addTo(map);

        mapRef.current = map;

        // Active-order layer: pickup + dropoff rendered as Wolt-style
        // teardrop pins (coloured disc with a vector icon glyph, set on
        // a sharp tail pointing at the actual coordinate). The route
        // between them is drawn as two stacked polylines — a soft white
        // halo underneath and a solid violet core on top — for the
        // clean Bolt/Uber look (rounded caps, no dashes).
        //
        // Glyphs are inline SVGs, not emoji: emojis render with the OS
        // font and look amateur on the dark map. The storefront/house
        // SVGs read instantly as restaurant/home from a phone distance.
        const STOREFRONT_SVG = `
          <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <!-- Awning -->
            <path d="M3 8 L21 8 L20 10 L4 10 Z" fill="#ffffff" opacity="0.95"/>
            <!-- Awning scallops -->
            <path d="M5 10 q1 -1.6 2 0 q1 -1.6 2 0 q1 -1.6 2 0 q1 -1.6 2 0 q1 -1.6 2 0 q1 -1.6 2 0 q1 -1.6 2 0" stroke="#ffffff" stroke-width="0.7" fill="none" opacity="0.6"/>
            <!-- Storefront body -->
            <path d="M4 10 L4 21 L20 21 L20 10 Z" fill="#ffffff" opacity="0.95"/>
            <!-- Door -->
            <rect x="10" y="13" width="4" height="8" rx="0.5" fill="#7c3aed"/>
            <!-- Windows -->
            <rect x="5.5" y="12" width="3" height="3" rx="0.4" fill="#7c3aed"/>
            <rect x="15.5" y="12" width="3" height="3" rx="0.4" fill="#7c3aed"/>
          </svg>
        `;
        const HOUSE_SVG = `
          <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <!-- Roof -->
            <path d="M12 3 L21 11 L19 11 L19 21 L5 21 L5 11 L3 11 Z" fill="#ffffff" opacity="0.95"/>
            <!-- Door -->
            <rect x="10" y="14" width="4" height="7" rx="0.5" fill="#10b981"/>
            <!-- Window -->
            <rect x="6.5" y="13" width="2.5" height="2.5" rx="0.3" fill="#10b981"/>
            <rect x="15" y="13" width="2.5" height="2.5" rx="0.3" fill="#10b981"/>
          </svg>
        `;
        const dropPinHtml = (color: string, glyphSvg: string, ringColor: string): string => `
          <div style="position:relative;width:36px;height:46px;">
            <!-- Soft shadow under the pin -->
            <div style="position:absolute;left:50%;bottom:-2px;transform:translateX(-50%);width:18px;height:5px;border-radius:9999px;background:rgba(0,0,0,0.45);filter:blur(2.5px);"></div>
            <!-- Tail (pointer at the exact coordinate) -->
            <div style="position:absolute;left:50%;top:30px;transform:translateX(-50%);width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:14px solid ${color};"></div>
            <!-- Outer halo ring -->
            <div style="position:absolute;left:50%;top:0;transform:translateX(-50%);width:36px;height:36px;border-radius:9999px;background:${ringColor};"></div>
            <!-- Main disc -->
            <div style="position:absolute;left:50%;top:2px;transform:translateX(-50%);width:32px;height:32px;border-radius:9999px;background:${color};border:2.5px solid #ffffff;box-shadow:0 6px 14px rgba(0,0,0,0.35), inset 0 2px 3px rgba(255,255,255,0.35), inset 0 -3px 4px rgba(0,0,0,0.18);display:flex;align-items:center;justify-content:center;">${glyphSvg}</div>
          </div>
        `;
        const polyBounds: Array<[number, number]> = [];
        for (const pin of activePins) {
          if (pin.pickupLat != null && pin.pickupLng != null) {
            polyBounds.push([pin.pickupLat, pin.pickupLng]);
            L.marker([pin.pickupLat, pin.pickupLng], {
              icon: L.divIcon({
                className: 'rider-pickup-pin',
                html: dropPinHtml('#7c3aed', STOREFRONT_SVG, 'rgba(124,58,237,0.22)'),
                iconSize: [36, 46],
                iconAnchor: [18, 44],
              }),
            }).addTo(map);
          }
          if (pin.dropoffLat != null && pin.dropoffLng != null) {
            polyBounds.push([pin.dropoffLat, pin.dropoffLng]);
            L.marker([pin.dropoffLat, pin.dropoffLng], {
              icon: L.divIcon({
                className: 'rider-dropoff-pin',
                html: dropPinHtml('#10b981', HOUSE_SVG, 'rgba(16,185,129,0.22)'),
                iconSize: [36, 46],
                iconAnchor: [18, 44],
              }),
            }).addTo(map);
          }
          if (
            pin.pickupLat != null &&
            pin.pickupLng != null &&
            pin.dropoffLat != null &&
            pin.dropoffLng != null
          ) {
            const segment: Array<[number, number]> = [
              [pin.pickupLat, pin.pickupLng],
              [pin.dropoffLat, pin.dropoffLng],
            ];
            // Halo: wider white stroke underneath the core line. Reads
            // as a soft glow on the dark CARTO basemap.
            L.polyline(segment, {
              color: '#ffffff',
              weight: 8,
              opacity: 0.35,
              lineCap: 'round',
              lineJoin: 'round',
            }).addTo(map);
            // Core: solid violet brand line. Rounded caps + no dashes.
            L.polyline(segment, {
              color: '#7c3aed',
              weight: 4,
              opacity: 0.95,
              lineCap: 'round',
              lineJoin: 'round',
            }).addTo(map);
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

        // Last-known-position fallback: if we have a stored position from a
        // previous session / before GPS warms up, show a faded dashed-ring
        // pin so the courier knows where they last were. Removed the moment
        // the first live fix arrives.
        const stored = loadLastPos();
        if (stored) {
          const ageStr = ageLabel(stored.ts);
          fallbackMarkerRef.current = L.marker(
            [stored.lat, stored.lng],
            {
              icon: L.divIcon({
                className: '',
                html: `<div title="Ultima locație cunoscută — acum ${ageStr}" style="width:44px;height:44px;border-radius:9999px;background:rgba(124,58,237,0.22);border:2px dashed rgba(124,58,237,0.55);opacity:0.6;box-sizing:border-box;"></div>`,
                iconSize: [44, 44],
                iconAnchor: [22, 22],
              }),
            },
          ).addTo(map);
          // Center on stored position only when there are no active-order
          // pins to fit (polyBounds already handled that case above).
          if (polyBounds.length < 2) map.setView([stored.lat, stored.lng], RIDER_ZOOM);
        }

        // RESIZE HANDLING.
        //
        // Symptom this fixes: on mobile (especially iOS Safari + the dashboard
        // root where the map is `fillParent` inside a `100vh` container) the
        // Leaflet map captured the container size BEFORE the parent reached
        // its final height, and stayed stuck on half the viewport until the
        // user manually resized / pinched. The single `setTimeout(0)` we
        // previously called wasn't enough — the parent layout settles across
        // multiple paint frames (header chrome, badges, dynamic content) and
        // the address bar hides/shows on scroll.
        //
        // Three-pronged fix:
        //   1. Multi-tick invalidateSize() schedule covering the typical
        //      mount→paint→settle window (0 / 60 / 200 / 600 / 1500 ms).
        //   2. ResizeObserver on the container so any later layout shift
        //      (orientation change, parent flex grow) re-syncs the tiles.
        //   3. window resize + visibilitychange listeners as a fallback for
        //      browsers without RO and for tab-restore scenarios where the
        //      container size changes while the tab was hidden.
        const invalidateNow = () => {
          if (cancelledRef.current) return;
          try {
            map.invalidateSize({ animate: false });
          } catch {
            /* ignore — map may have been removed */
          }
        };
        const resizeTimers: number[] = [];
        for (const delay of [0, 60, 200, 600, 1500]) {
          resizeTimers.push(window.setTimeout(invalidateNow, delay));
        }
        let resizeObserver: ResizeObserver | null = null;
        if (containerRef.current && typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => invalidateNow());
          resizeObserver.observe(containerRef.current);
        }
        const onWindowResize = () => invalidateNow();
        const onVisibilityChange = () => {
          if (document.visibilityState === 'visible') invalidateNow();
        };
        window.addEventListener('resize', onWindowResize, { passive: true });
        window.addEventListener('orientationchange', onWindowResize, { passive: true });
        document.addEventListener('visibilitychange', onVisibilityChange);
        // Stash on the map for the cleanup branch below.
        (map as unknown as Record<string, unknown>).__riderResizeCleanup = () => {
          for (const t of resizeTimers) window.clearTimeout(t);
          if (resizeObserver) {
            try { resizeObserver.disconnect(); } catch { /* ignore */ }
          }
          window.removeEventListener('resize', onWindowResize);
          window.removeEventListener('orientationchange', onWindowResize);
          document.removeEventListener('visibilitychange', onVisibilityChange);
        };

        // Track last-known heading so the icon stays oriented even when the
        // device is briefly stationary (heading goes null at speed 0).
        let lastHeadingDeg: number | null = null;
        let lastLat: number | null = null;
        let lastLng: number | null = null;

        // GPS interpolation state — Wolt's marker doesn't snap on each
        // fix, it eases between the previous and the new coordinate over
        // ~600 ms. We drive the easing with rAF, cancel any in-flight
        // animation when a new fix arrives, and fall back to setLatLng
        // jumps for identical points. The rAF id lives on `animationFrameIdRef`
        // so the useEffect cleanup can cancel it across re-runs.
        const INTERPOLATE_MS = 600;
        const cancelInterpolation = () => {
          if (animationFrameIdRef.current != null) {
            cancelAnimationFrame(animationFrameIdRef.current);
            animationFrameIdRef.current = null;
          }
        };

        const id = navigator.geolocation.watchPosition(
          (pos) => {
            if (cancelledRef.current) return;
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const accuracyMeters = pos.coords.accuracy;
            setPermission('granted');
            lastFixRef.current = { lat, lng };

            // Persist this fix so we can show it as fallback if GPS drops.
            saveLastPos(lat, lng);

            // Remove the stale fallback marker the moment we get a live fix.
            if (fallbackMarkerRef.current) {
              const fm = fallbackMarkerRef.current as unknown as { remove?: () => void };
              fm.remove?.();
              fallbackMarkerRef.current = null;
            }

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

            lastLat = lat;
            lastLng = lng;

            // First fix → just place the marker; subsequent fixes →
            // animate from the marker's CURRENT displayed position to
            // the new one over INTERPOLATE_MS so the icon glides
            // instead of snapping. Reading from `marker.getLatLng()`
            // (rather than the raw last-fix coordinate) is what avoids
            // the snap-to-old-target bug when fixes arrive faster than
            // INTERPOLATE_MS — Codex review on PR #275.
            if (!markerRef.current) {
              const icon = makeRiderIcon(L, vehicleType, lastHeadingDeg ?? 0);
              markerRef.current = L.marker([lat, lng], { icon }).addTo(map);
              if (polyBounds.length < 2) map.setView([lat, lng], RIDER_ZOOM);
            } else {
              cancelInterpolation();
              const cur = markerRef.current.getLatLng();
              const startLat = cur.lat;
              const startLng = cur.lng;
              if (startLat === lat && startLng === lng) {
                markerRef.current.setLatLng([lat, lng]);
              } else {
                const startTs = performance.now();
                const step = () => {
                  if (cancelledRef.current || !markerRef.current) {
                    animationFrameIdRef.current = null;
                    return;
                  }
                  const elapsed = performance.now() - startTs;
                  const t = Math.min(1, elapsed / INTERPOLATE_MS);
                  const easedT = 1 - (1 - t) * (1 - t); // ease-out quad
                  const curLat = startLat + (lat - startLat) * easedT;
                  const curLng = startLng + (lng - startLng) * easedT;
                  markerRef.current.setLatLng([curLat, curLng]);
                  if (t < 1) {
                    animationFrameIdRef.current = requestAnimationFrame(step);
                  } else {
                    animationFrameIdRef.current = null;
                  }
                };
                animationFrameIdRef.current = requestAnimationFrame(step);
              }
            }

            // Rebuild the icon with the updated heading so the directional
            // wedge in CourierMarker points the right way. setIcon is cheap
            // because the SVG is generated synchronously via renderToStaticMarkup.
            if (nextHeading != null && markerRef.current?.setIcon) {
              markerRef.current.setIcon(makeRiderIcon(L, vehicleType, lastHeadingDeg ?? 0));
            }
          },
          (err) => {
            if (err.code === err.PERMISSION_DENIED) {
              // Permission revoked — stale position is no longer trustworthy.
              clearLastPos();
              setPermission('denied');
            } else {
              setPermission('error');
              console.warn('[rider-map] watchPosition error', err.code, err.message);
              // GPS timeout / unavailable: if the fallback marker was not
              // already shown (first load where stored pos was absent) and
              // the live marker exists, keep the live marker visible. If no
              // live marker yet, try to show the stored fallback position.
              if (!markerRef.current && !fallbackMarkerRef.current && mapRef.current) {
                const pos = loadLastPos();
                if (pos) {
                  const ageStr = ageLabel(pos.ts);
                  fallbackMarkerRef.current = L.marker(
                    [pos.lat, pos.lng],
                    {
                      icon: L.divIcon({
                        className: '',
                        html: `<div title="Ultima locație cunoscută — acum ${ageStr}" style="width:44px;height:44px;border-radius:9999px;background:rgba(124,58,237,0.22);border:2px dashed rgba(124,58,237,0.55);opacity:0.6;box-sizing:border-box;"></div>`,
                        iconSize: [44, 44],
                        iconAnchor: [22, 22],
                      }),
                    },
                  ).addTo(mapRef.current);
                }
              }
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
      if (animationFrameIdRef.current != null) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      if (watchIdRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (mapRef.current) {
        // Tear down the resize observers + listeners attached during init.
        const cleanup = (mapRef.current as unknown as Record<string, unknown>)
          .__riderResizeCleanup as (() => void) | undefined;
        if (typeof cleanup === 'function') {
          try { cleanup(); } catch { /* ignore */ }
        }
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerRef.current = null;
      fallbackMarkerRef.current = null;
    };
    // We intentionally re-init when activePins or vehicleType change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(activePins), vehicleType]);

  function handleRecenter() {
    if (recentering) return;
    const map = mapRef.current;
    if (!map) return;

    // Fast path: we have a recent fix from watchPosition. Fly to it
    // immediately so the courier doesn't wait on a fresh getCurrentPosition
    // round trip (which can take 5-10s on cold GPS).
    const last = lastFixRef.current;
    if (last) {
      if (typeof map.flyTo === 'function') {
        map.flyTo([last.lat, last.lng], RIDER_ZOOM, { duration: 0.8 });
      } else {
        map.setView([last.lat, last.lng], RIDER_ZOOM);
      }
      return;
    }

    // Slow path: no fix yet. Trigger getCurrentPosition once. The
    // watchPosition handler is still running in the background so the
    // pin will keep moving normally afterwards.
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    setRecentering(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRecentering(false);
        if (!mapRef.current) return;
        const { latitude: lat, longitude: lng } = pos.coords;
        lastFixRef.current = { lat, lng };
        if (typeof mapRef.current.flyTo === 'function') {
          mapRef.current.flyTo([lat, lng], RIDER_ZOOM, { duration: 0.8 });
        } else {
          mapRef.current.setView([lat, lng], RIDER_ZOOM);
        }
      },
      () => {
        setRecentering(false);
      },
      { enableHighAccuracy: false, maximumAge: 15_000, timeout: 8_000 },
    );
  }

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

      {permission === 'pending' && (
        // Discreet GPS-warming hint at the top of the map — replaces the
        // generic "În așteptare comandă" label until we have a fix, so the
        // rider knows the location lookup is still in flight (not stuck).
        <div className="pointer-events-none absolute left-1/2 top-3 z-[1000] -translate-x-1/2 rounded-full border border-zinc-700 bg-zinc-950/85 px-3 py-1.5 text-[11px] font-medium text-zinc-300 shadow-md backdrop-blur">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300 align-middle" />
          Localizez poziția…
        </div>
      )}

      {permission === 'granted' && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[1000] -translate-x-1/2 rounded-full border border-zinc-700 bg-zinc-950/85 px-3 py-1.5 text-[11px] font-medium text-zinc-300 shadow-md backdrop-blur">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 align-middle" />
          În așteptare comandă
        </div>
      )}

      {permission === 'denied' && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-zinc-950/85 p-6 text-center backdrop-blur-sm">
          <div className="max-w-xs">
            <p className="text-sm font-semibold text-zinc-100">Locația este dezactivată</p>
            <p className="mt-2 text-xs text-zinc-400">
              Activează permisiunile de locație pentru a vedea harta și a primi comenzi din apropiere.
            </p>
          </div>
        </div>
      )}

      {permission === 'unsupported' && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-zinc-950/85 p-6 text-center">
          <p className="text-xs text-zinc-400">Browserul nu suportă geolocalizarea.</p>
        </div>
      )}

      {permission === 'error' && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-zinc-950/85 p-6 text-center">
          <p className="text-xs text-zinc-400">
            Nu am putut porni harta. Verifică internetul și reîmprospătează.
          </p>
        </div>
      )}

      {/* Recenter / find-me button. Lives bottom-right above the bottom nav
          (which sits at 80px = bottom-20). Disabled when the courier has
          denied permission or the device doesn't support geolocation. */}
      {(permission === 'granted' || permission === 'pending') && (
        <button
          type="button"
          onClick={handleRecenter}
          disabled={recentering}
          aria-label="Centrează pe poziția mea"
          className="absolute bottom-24 right-3 z-[1000] flex h-11 w-11 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950/90 text-violet-300 shadow-lg backdrop-blur transition hover:bg-zinc-900 hover:text-violet-200 active:scale-95 disabled:opacity-50"
        >
          {recentering ? (
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.3" />
              <path
                d="M21 12a9 9 0 0 0-9-9"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="3" fill="currentColor" />
              <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.8" />
              <line x1="12" y1="1" x2="12" y2="4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="12" y1="20" x2="12" y2="23" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="1" y1="12" x2="4" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="20" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
