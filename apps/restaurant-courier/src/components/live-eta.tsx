'use client';

import { useEffect, useRef, useState } from 'react';
import { Navigation2 } from 'lucide-react';

// Speed estimates by vehicle type, in km/h.
const SPEED_KMH: Record<string, number> = {
  BIKE: 10,
  SCOOTER: 25,
  CAR: 40,
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type Props = {
  dropoffLat: number;
  dropoffLng: number;
  vehicleType: string;
};

type EtaState =
  | { status: 'loading' }
  | { status: 'denied' }
  | { status: 'ok'; distanceKm: number; etaMin: number }
  | { status: 'arrived' };

const REFRESH_MS = 30_000;

/**
 * Shows a live ETA + distance-remaining pill while the courier is
 * actively delivering (PICKED_UP / IN_TRANSIT). Reads geolocation via
 * watchPosition and recomputes every 30 seconds to balance battery vs.
 * accuracy. Renders nothing when permission is denied — the parent
 * already handles the permission-denied flow on the location tracker.
 */
export function LiveEta({ dropoffLat, dropoffLng, vehicleType }: Props) {
  const [state, setState] = useState<EtaState>({ status: 'loading' });
  const lastComputedAt = useRef<number>(0);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      // Geolocation not available — hide silently.
      setState({ status: 'denied' });
      return;
    }

    function compute(pos: GeolocationPosition) {
      const now = Date.now();
      // Throttle recompute to REFRESH_MS; watchPosition can fire faster.
      if (now - lastComputedAt.current < REFRESH_MS) return;
      lastComputedAt.current = now;

      const distanceKm = haversineKm(
        pos.coords.latitude,
        pos.coords.longitude,
        dropoffLat,
        dropoffLng,
      );

      const speedKmh = SPEED_KMH[vehicleType] ?? SPEED_KMH.BIKE;
      const etaMin = Math.round((distanceKm / speedKmh) * 60);

      if (distanceKm < 0.05) {
        // Within 50 m — treat as arrived.
        setState({ status: 'arrived' });
      } else {
        setState({ status: 'ok', distanceKm, etaMin });
      }
    }

    function onError(err: GeolocationPositionError) {
      if (err.code === err.PERMISSION_DENIED) {
        setState({ status: 'denied' });
      }
      // TIMEOUT / POSITION_UNAVAILABLE — keep the last state, try again.
    }

    // Force an immediate first reading so the pill isn't stuck on
    // "loading" for the full 30-second interval.
    navigator.geolocation.getCurrentPosition(compute, onError, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 10_000,
    });

    watchIdRef.current = navigator.geolocation.watchPosition(compute, onError, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 10_000,
    });

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [dropoffLat, dropoffLng, vehicleType]);

  if (state.status === 'loading' || state.status === 'denied') return null;

  if (state.status === 'arrived') {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
        <Navigation2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
        <p className="text-sm font-semibold text-emerald-300">Ai ajuns la destinație</p>
      </div>
    );
  }

  // Clamp display: 0 min → "< 1 min".
  const etaLabel = state.etaMin <= 0 ? '< 1 min' : `${state.etaMin} min`;
  const distLabel =
    state.distanceKm >= 1
      ? `${state.distanceKm.toFixed(1)} km`
      : `${Math.round(state.distanceKm * 1000)} m`;

  // Progress bar: assumes max practical delivery distance is 10 km.
  const MAX_KM = 10;
  const progressPct = Math.max(0, Math.min(100, (1 - state.distanceKm / MAX_KM) * 100));

  return (
    <div className="rounded-2xl border border-violet-500/30 bg-hir-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Navigation2 className="h-4 w-4 shrink-0 text-violet-400" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wide text-violet-400">
            ETA live
          </span>
        </div>
        <div className="text-right">
          <span className="text-base font-bold text-hir-fg">ETA: {etaLabel}</span>
          <span className="ml-2 text-sm text-hir-muted-fg">· {distLabel} rămas</span>
        </div>
      </div>

      {/* Progress bar — visual indicator of remaining distance */}
      <div
        role="progressbar"
        aria-valuenow={Math.round(progressPct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progres livrare: ${distLabel} rămași`}
        className="h-2 w-full overflow-hidden rounded-full bg-hir-border"
      >
        <div
          className="h-full rounded-full bg-violet-500 transition-all duration-700"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <p className="mt-2 text-[10px] text-hir-muted-fg">
        Actualizat la fiecare 30 s · estimat pe baza vitezei medii
      </p>
    </div>
  );
}
