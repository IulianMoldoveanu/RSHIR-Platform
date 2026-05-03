'use client';

import { useEffect, useRef, useState } from 'react';

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;

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
};

type LeafletMap = {
  setView: (latlng: [number, number], zoom: number) => LeafletMap;
  remove: () => void;
  invalidateSize: () => void;
};

type LeafletLayer = { addTo: (map: LeafletMap) => LeafletLayer };

type LeafletMarker = {
  addTo: (map: LeafletMap) => LeafletMarker;
  setLatLng: (latlng: [number, number]) => LeafletMarker;
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

type Permission = 'pending' | 'granted' | 'denied' | 'unsupported' | 'error';

export function RiderMap() {
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
      .then((L) => {
        if (cancelledRef.current || !containerRef.current) return;

        const map = L.map(containerRef.current, {
          zoomControl: true,
        }).setView(FALLBACK_CENTER, FALLBACK_ZOOM);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        mapRef.current = map;

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
              const icon = L.divIcon({
                className: 'rider-map-pin',
                html:
                  '<span style="display:block;width:18px;height:18px;border-radius:9999px;background:#7c3aed;box-shadow:0 0 0 6px rgba(124,58,237,0.25);border:2px solid #ffffff"></span>',
                iconSize: [18, 18],
                iconAnchor: [9, 9],
              });
              markerRef.current = L.marker([lat, lng], { icon }).addTo(map);
              map.setView([lat, lng], RIDER_ZOOM);
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
  }, []);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-[calc(100vh-14rem)] min-h-[420px] w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900"
      />

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
