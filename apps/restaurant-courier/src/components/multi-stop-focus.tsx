'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Navigation, Package, Route } from 'lucide-react';
import { haversineMeters } from '@/lib/geofence';

export type FocusOrder = {
  id: string;
  status: 'ACCEPTED' | 'PICKED_UP' | 'IN_TRANSIT';
  vertical: 'restaurant' | 'pharma' | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  pickup_line1: string | null;
  dropoff_line1: string | null;
  customer_first_name: string | null;
};

type Stop = {
  orderId: string;
  kind: 'pickup' | 'dropoff';
  label: string;
  address: string;
  lat: number | null;
  lng: number | null;
  distanceM: number | null;
};

/**
 * Multi-stop focus banner. Renders only when the courier has 2+ active
 * orders. Distils them into a single "do this next" instruction, plus a
 * compact breadcrumb of the remaining stops.
 *
 * The complementary top-right cards on the dashboard show ALL active orders
 * with sequence numbers. This banner is the OPERATOR'S compass: one verb,
 * one address, one distance from the current location.
 *
 * Computes the optimal next stop by:
 *   - Status priority: PICKED_UP/IN_TRANSIT orders deliver first (they're
 *     blocking; the food is in the bag).
 *   - Within the same priority bucket, sort by haversine distance from the
 *     current GPS fix (read once on mount, refreshed on a 30s timer).
 *
 * Renders null on <2 active orders OR when there's no GPS fix yet (no point
 * showing the banner without a meaningful "from here" anchor).
 */
export function MultiStopFocus({ orders }: { orders: FocusOrder[] }) {
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    let cancelled = false;
    const read = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          // GPS not available — banner stays hidden via the me-null guard.
        },
        { enableHighAccuracy: false, maximumAge: 15_000, timeout: 4_000 },
      );
    };

    read();
    // Re-read every 30 s to keep distances honest as the courier moves.
    const id = setInterval(read, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (orders.length < 2) return null;
  if (!me) return null;

  // Build the list of pending stops. For ACCEPTED orders the next stop is
  // the pickup; for PICKED_UP / IN_TRANSIT it's the dropoff.
  const stops: Stop[] = orders.map((o): Stop => {
    const isPickup = o.status === 'ACCEPTED';
    const lat = isPickup ? o.pickup_lat : o.dropoff_lat;
    const lng = isPickup ? o.pickup_lng : o.dropoff_lng;
    const address =
      (isPickup ? o.pickup_line1 : o.dropoff_line1) ?? o.customer_first_name ?? '—';
    const distance =
      lat !== null && lng !== null ? haversineMeters(me.lat, me.lng, lat, lng) : null;
    return {
      orderId: o.id,
      kind: isPickup ? 'pickup' : 'dropoff',
      label: isPickup ? 'Ridică' : 'Livrează',
      address,
      lat,
      lng,
      distanceM: distance,
    };
  });

  // Optimal order = drop-offs first (food in hand), then pickups, both
  // sorted by current distance. The dashboard's status sort already
  // bumped PICKED_UP/IN_TRANSIT to the top of `orders`, so respecting
  // that order before re-sorting by distance gives a stable result.
  const sortedStops = stops
    .slice()
    .sort((a, b) => {
      const ap = a.kind === 'dropoff' ? 0 : 1;
      const bp = b.kind === 'dropoff' ? 0 : 1;
      if (ap !== bp) return ap - bp;
      const ad = a.distanceM ?? Number.POSITIVE_INFINITY;
      const bd = b.distanceM ?? Number.POSITIVE_INFINITY;
      return ad - bd;
    });

  const next = sortedStops[0];
  const remaining = sortedStops.slice(1);

  // Sum remaining travel for the trailing breadcrumb.
  const totalRemainingM = sortedStops.reduce(
    (sum, s) => sum + (s.distanceM ?? 0),
    0,
  );

  return (
    <div className="pointer-events-auto mx-auto flex w-full max-w-md flex-col gap-2 rounded-2xl border border-violet-400/40 bg-zinc-950/95 p-3 shadow-xl backdrop-blur">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
        <Route className="h-3.5 w-3.5" aria-hidden />
        Multi-stop · {orders.length} comenzi · ~{formatDistance(totalRemainingM)}
      </div>

      {/* NEXT — primary CTA */}
      <Link
        href={`/dashboard/orders/${next.orderId}`}
        className="flex items-center gap-3 rounded-xl bg-violet-500/15 px-3 py-2.5 hover:bg-violet-500/25"
      >
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white"
        >
          {next.kind === 'pickup' ? (
            <Package className="h-4 w-4" />
          ) : (
            <Navigation className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-300">
            Următoarea oprire · {next.label.toLowerCase()}
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-zinc-100">
            {next.address}
          </p>
          {next.distanceM !== null ? (
            <p className="text-[11px] text-zinc-400">
              {formatDistance(next.distanceM)} de aici
            </p>
          ) : null}
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-violet-300" aria-hidden />
      </Link>

      {/* Remaining stops — breadcrumb chips */}
      {remaining.length > 0 ? (
        <ol className="flex items-center gap-1.5 overflow-x-auto text-[10px] text-zinc-400">
          {remaining.map((s, i) => (
            <li key={s.orderId} className="flex items-center gap-1.5 whitespace-nowrap">
              <span
                aria-hidden
                className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-800 text-[9px] font-semibold text-zinc-300"
              >
                {i + 2}
              </span>
              <span>{s.label}</span>
              {s.distanceM !== null ? (
                <span className="text-zinc-500">· {formatDistance(s.distanceM)}</span>
              ) : null}
              {i < remaining.length - 1 ? (
                <span className="text-zinc-700">→</span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function formatDistance(m: number | null): string {
  if (m === null || !Number.isFinite(m)) return '—';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}
