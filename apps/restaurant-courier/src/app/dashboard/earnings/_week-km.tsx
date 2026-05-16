import { MapPin } from 'lucide-react';

type Row = {
  updated_at: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
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

/**
 * Compact card showing total km this week + km/livrare ratio. Pure
 * server-rendered, derived from the trailing30 dataset already fetched
 * by the earnings page — no extra query.
 *
 * Hidden when this-week count is zero so a Monday-morning empty page
 * doesn't show "0 km, 0 livrări".
 */
export function WeekKm({
  rows,
  weekStart,
}: {
  /** DELIVERED orders from trailing 30 days, including this week. */
  rows: Row[];
  /** Start-of-week boundary (Bucharest local Monday 00:00). */
  weekStart: Date;
}) {
  const startMs = weekStart.getTime();
  const weekRows = rows.filter(
    (r) => new Date(r.updated_at).getTime() >= startMs,
  );

  let totalKm = 0;
  for (const r of weekRows) {
    if (
      r.pickup_lat != null &&
      r.pickup_lng != null &&
      r.dropoff_lat != null &&
      r.dropoff_lng != null
    ) {
      totalKm += haversineKm(r.pickup_lat, r.pickup_lng, r.dropoff_lat, r.dropoff_lng);
    }
  }

  const count = weekRows.length;
  if (count === 0) return null;
  const kmPerDelivery = totalKm / count;

  return (
    <section
      aria-label="Kilometri săptămâna aceasta"
      className="flex items-center gap-3 rounded-2xl border border-hir-border bg-hir-surface p-4"
    >
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-500/15"
      >
        <MapPin className="h-5 w-5 text-sky-300" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-hir-muted-fg">
          Săptămâna aceasta
        </p>
        <p className="mt-0.5 text-sm text-hir-fg">
          <span className="font-bold tabular-nums">{totalKm.toFixed(1)} km</span>{' '}
          <span className="text-hir-muted-fg">
            · {count} livr{count === 1 ? 'are' : 'ări'} · ~{kmPerDelivery.toFixed(1)} km/livrare
          </span>
        </p>
      </div>
    </section>
  );
}
