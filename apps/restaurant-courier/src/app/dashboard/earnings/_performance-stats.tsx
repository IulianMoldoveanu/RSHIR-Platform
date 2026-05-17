import { CheckCircle, Clock, MapPin, TrendingUp } from 'lucide-react';

type Props = {
  /** DELIVERED orders from the last 30 days, with timestamps + coordinates. */
  rows: Array<{
    created_at: string;
    updated_at: string;
    pickup_lat: number | null;
    pickup_lng: number | null;
    dropoff_lat: number | null;
    dropoff_lng: number | null;
  }>;
  /** All assigned orders from last 30 days regardless of final status. */
  allAssignedRows: Array<{ status: string }>;
};

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeStats(rows: Props['rows'], allAssignedRows: Props['allAssignedRows']) {
  const deliveredCount = rows.length;

  // Accept rate: DELIVERED / (DELIVERED + CANCELLED + FAILED) assigned to me.
  const terminalCount = allAssignedRows.filter(
    (r) => r.status === 'DELIVERED' || r.status === 'CANCELLED' || r.status === 'FAILED',
  ).length;
  const acceptRate = terminalCount > 0 ? (deliveredCount / terminalCount) * 100 : null;

  // Average delivery time: created_at → updated_at (DELIVERED).
  // Outliers > 4h (14400000ms) are dropped — stale orders the courier forgot.
  const validTimes = rows
    .map((r) => new Date(r.updated_at).getTime() - new Date(r.created_at).getTime())
    .filter((ms) => ms > 0 && ms < 14_400_000);
  const avgMinutes =
    validTimes.length > 0
      ? Math.round(validTimes.reduce((s, v) => s + v, 0) / validTimes.length / 60_000)
      : null;

  // Total km: haversine per order, summed.
  let totalKm = 0;
  for (const r of rows) {
    if (
      r.pickup_lat != null &&
      r.pickup_lng != null &&
      r.dropoff_lat != null &&
      r.dropoff_lng != null
    ) {
      totalKm += haversineKm(r.pickup_lat, r.pickup_lng, r.dropoff_lat, r.dropoff_lng);
    }
  }

  return { acceptRate, avgMinutes, totalKm, deliveredCount };
}

export function PerformanceStats({ rows, allAssignedRows }: Props) {
  const { acceptRate, avgMinutes, totalKm, deliveredCount } = computeStats(rows, allAssignedRows);

  // Don't show the card if the courier has no history yet.
  if (deliveredCount === 0) return null;

  return (
    <section aria-labelledby="perf-stats-heading">
      <h2
        id="perf-stats-heading"
        className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500"
      >
        Performanță — ultimele 30 de zile
      </h2>
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          icon={<CheckCircle className="h-4 w-4 text-emerald-400" aria-hidden />}
          label="Rată finalizare"
          value={acceptRate !== null ? `${acceptRate.toFixed(0)}%` : '—'}
          sub={`din ${allAssignedRows.filter((r) => ['DELIVERED', 'CANCELLED', 'FAILED'].includes(r.status)).length} alocate`}
        />
        <StatTile
          icon={<Clock className="h-4 w-4 text-violet-400" aria-hidden />}
          label="Timp mediu livrare"
          value={avgMinutes !== null ? `${avgMinutes} min` : '—'}
          sub="de la creare la livrat"
        />
        <StatTile
          icon={<MapPin className="h-4 w-4 text-sky-400" aria-hidden />}
          label="Kilometri parcurși"
          value={`${totalKm.toFixed(1)} km`}
          sub="distanță directă estimată"
        />
        <StatTile
          icon={<TrendingUp className="h-4 w-4 text-amber-400" aria-hidden />}
          label="Livrări totale"
          value={String(deliveredCount)}
          sub="în ultimele 30 de zile"
        />
      </div>
    </section>
  );
}

function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-hir-border bg-hir-surface p-4">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold leading-none text-zinc-100 tabular-nums">{value}</p>
      <p className="text-[10px] text-zinc-500">{sub}</p>
    </div>
  );
}
