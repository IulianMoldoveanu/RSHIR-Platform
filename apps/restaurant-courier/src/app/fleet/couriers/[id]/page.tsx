import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Banknote,
  Bike,
  Car,
  ChevronLeft,
  Clock,
  MapPin,
  Phone,
  Timer,
  Truck,
  TrendingUp,
} from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFleetManager } from '@/lib/fleet-manager';
import { CourierStatusActions } from '../_actions';

export const dynamic = 'force-dynamic';

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  vehicle_type: 'BIKE' | 'SCOOTER' | 'CAR';
  status: 'INACTIVE' | 'ACTIVE' | 'SUSPENDED';
  fleet_id: string;
  created_at: string;
};

type ShiftRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: 'ONLINE' | 'OFFLINE';
  last_lat: number | null;
  last_lng: number | null;
  last_seen_at: string | null;
};

type DeliveredRow = {
  id: string;
  customer_first_name: string | null;
  pickup_line1: string | null;
  dropoff_line1: string | null;
  total_ron: number | null;
  delivery_fee_ron: number | null;
  payment_method: 'CARD' | 'COD' | null;
  created_at: string;
  updated_at: string;
};

type ActiveRow = {
  id: string;
  status: string;
  customer_first_name: string | null;
  dropoff_line1: string | null;
  delivery_fee_ron: number | null;
};

const VEHICLE_ICON: Record<ProfileRow['vehicle_type'], React.ReactNode> = {
  BIKE: <Bike className="h-3.5 w-3.5" aria-hidden />,
  SCOOTER: <Truck className="h-3.5 w-3.5" aria-hidden />,
  CAR: <Car className="h-3.5 w-3.5" aria-hidden />,
};
const VEHICLE_LABEL: Record<ProfileRow['vehicle_type'], string> = {
  BIKE: 'Bicicletă',
  SCOOTER: 'Scuter',
  CAR: 'Mașină',
};
const STATUS_TONE: Record<ProfileRow['status'], { label: string; tone: string }> = {
  ACTIVE: { label: 'Activ', tone: 'bg-emerald-500/10 text-emerald-300' },
  INACTIVE: { label: 'Inactiv', tone: 'bg-zinc-800 text-zinc-400' },
  SUSPENDED: { label: 'Suspendat', tone: 'bg-amber-500/10 text-amber-300' },
};

function formatRoPhone(raw: string | null): string {
  if (!raw) return '—';
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('40') && digits.length === 11) {
    return `+40 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return raw;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return '<1m';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default async function FleetCourierDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const fleet = await requireFleetManager();
  const admin = createAdminClient();

  // Pull profile + last shift + 30-day stats + active orders in parallel.
  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);
  since30.setHours(0, 0, 0, 0);

  const [
    { data: profileData },
    { data: shiftsData },
    { data: deliveredMetricsData },
    { data: deliveredData },
    { data: activeData },
  ] = await Promise.all([
    admin
      .from('courier_profiles')
      .select('user_id, full_name, phone, vehicle_type, status, fleet_id, created_at')
      .eq('user_id', params.id)
      .eq('fleet_id', fleet.fleetId)
      .maybeSingle(),
    admin
      .from('courier_shifts')
      .select('id, started_at, ended_at, status, last_lat, last_lng, last_seen_at')
      .eq('courier_user_id', params.id)
      .order('started_at', { ascending: false })
      .limit(1),
    // Metrics query: pulls only the columns needed for aggregation, no
    // limit — Codex P1 #175 caught that a 60-row cap silently
    // under-reported high-volume riders. Rows are tiny (3 numbers + 2
    // ISO strings) so even 1500 deliveries/month stays cheap. Display
    // list below uses a separate limited query for full row data.
    admin
      .from('courier_orders')
      .select('total_ron, delivery_fee_ron, payment_method, created_at, updated_at')
      .eq('fleet_id', fleet.fleetId)
      .eq('assigned_courier_user_id', params.id)
      .eq('status', 'DELIVERED')
      .gte('updated_at', since30.toISOString()),
    // Display list — only the last 12 rows show on screen, so we narrow
    // the trip and skip the full text columns the metrics query above
    // didn't need.
    admin
      .from('courier_orders')
      .select(
        'id, customer_first_name, pickup_line1, dropoff_line1, total_ron, delivery_fee_ron, payment_method, created_at, updated_at',
      )
      .eq('fleet_id', fleet.fleetId)
      .eq('assigned_courier_user_id', params.id)
      .eq('status', 'DELIVERED')
      .gte('updated_at', since30.toISOString())
      .order('updated_at', { ascending: false })
      .limit(12),
    admin
      .from('courier_orders')
      .select('id, status, customer_first_name, dropoff_line1, delivery_fee_ron')
      .eq('fleet_id', fleet.fleetId)
      .eq('assigned_courier_user_id', params.id)
      .in('status', ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'])
      .order('updated_at', { ascending: false }),
  ]);

  const profile = profileData as ProfileRow | null;
  if (!profile) notFound();

  const lastShift = ((shiftsData ?? []) as ShiftRow[])[0] ?? null;
  const deliveredMetrics = (deliveredMetricsData ?? []) as Array<{
    total_ron: number | null;
    delivery_fee_ron: number | null;
    payment_method: 'CARD' | 'COD' | null;
    created_at: string;
    updated_at: string;
  }>;
  const delivered = (deliveredData ?? []) as DeliveredRow[];
  const active = (activeData ?? []) as ActiveRow[];

  // Aggregate metrics over the FULL 30-day window (not the 12-row display
  // sample) — count, revenue, cashCollected, avgDuration all derive from
  // deliveredMetrics so high-volume riders get accurate numbers.
  const count = deliveredMetrics.length;
  const revenue = deliveredMetrics.reduce(
    (sum, r) => sum + (Number(r.delivery_fee_ron) || 0),
    0,
  );
  const cashCollected = deliveredMetrics
    .filter((r) => r.payment_method === 'COD')
    .reduce((sum, r) => sum + (Number(r.total_ron) || 0), 0);

  // Average delivery time = avg(updated_at - created_at) over the
  // last 30 days. This isn't pickup-to-delivery (we don't have a
  // dedicated picked_up_at column), but it's the best signal we have
  // without changing schema. Outliers >24h are dropped — typically
  // those are stale orders the rider forgot to mark delivered.
  const validTimes = deliveredMetrics
    .map((r) => new Date(r.updated_at).getTime() - new Date(r.created_at).getTime())
    .filter((d) => Number.isFinite(d) && d > 0 && d < 24 * 60 * 60 * 1000);
  const avgDurationMs =
    validTimes.length > 0
      ? validTimes.reduce((a, b) => a + b, 0) / validTimes.length
      : NaN;

  const statusBadge = STATUS_TONE[profile.status];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Link
        href="/fleet/couriers"
        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        Înapoi la curieri
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-100">
            {profile.full_name ?? 'Curier'}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1">
              {VEHICLE_ICON[profile.vehicle_type]}
              {VEHICLE_LABEL[profile.vehicle_type]}
            </span>
            {profile.phone ? (
              <a
                href={`tel:${profile.phone}`}
                className="inline-flex items-center gap-1 text-violet-300 hover:text-violet-200"
              >
                <Phone className="h-3 w-3" aria-hidden />
                {formatRoPhone(profile.phone)}
              </a>
            ) : (
              <span className="text-zinc-500">Fără telefon</span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadge.tone}`}
          >
            {statusBadge.label}
          </span>
          <CourierStatusActions userId={profile.user_id} status={profile.status} />
        </div>
      </div>

      {/* Current shift card */}
      {lastShift ? (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            {lastShift.status === 'ONLINE' ? 'Tură curentă' : 'Ultima tură'}
          </p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Stat
              icon={<Clock className="h-3.5 w-3.5 text-violet-400" aria-hidden />}
              label="Început"
              value={new Date(lastShift.started_at).toLocaleString('ro-RO', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            />
            <Stat
              icon={<Timer className="h-3.5 w-3.5 text-violet-400" aria-hidden />}
              label="Durată"
              value={formatDuration(
                (lastShift.ended_at ? new Date(lastShift.ended_at).getTime() : Date.now()) -
                  new Date(lastShift.started_at).getTime(),
              )}
            />
            {lastShift.last_lat != null && lastShift.last_lng != null ? (
              <a
                href={`https://www.openstreetmap.org/?mlat=${lastShift.last_lat}&mlon=${lastShift.last_lng}#map=17/${lastShift.last_lat}/${lastShift.last_lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="col-span-2 inline-flex items-center gap-1 text-violet-300 hover:text-violet-200"
              >
                <MapPin className="h-3 w-3" aria-hidden />
                Ultimă locație ·{' '}
                {lastShift.last_seen_at
                  ? new Date(lastShift.last_seen_at).toLocaleTimeString('ro-RO', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
              </a>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900 px-4 py-6 text-center text-xs text-zinc-500">
          Curierul nu a pornit încă o tură.
        </section>
      )}

      {/* 30-day metrics */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          Ultimele 30 zile
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric
            icon={<TrendingUp className="h-4 w-4 text-violet-400" aria-hidden />}
            label="Livrări"
            value={String(count)}
          />
          <Metric
            icon={<Banknote className="h-4 w-4 text-emerald-400" aria-hidden />}
            label="Câștig"
            value={`${revenue.toFixed(2)} RON`}
          />
          <Metric
            icon={<Banknote className="h-4 w-4 text-amber-400" aria-hidden />}
            label="Cash colectat"
            value={`${cashCollected.toFixed(2)} RON`}
            hint={cashCollected === 0 ? 'Niciun COD' : undefined}
          />
          <Metric
            icon={<Timer className="h-4 w-4 text-zinc-400" aria-hidden />}
            label="Timp mediu"
            value={Number.isFinite(avgDurationMs) ? formatDuration(avgDurationMs) : '—'}
            hint="Creare → livrare"
          />
        </div>
      </section>

      {/* Active orders */}
      {active.length > 0 ? (
        <section className="rounded-2xl border border-violet-500/30 bg-zinc-900 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-violet-300">
            În curs ({active.length})
          </p>
          <ul className="flex flex-col gap-2">
            {active.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/fleet/orders/${o.id}`}
                  className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs hover:border-violet-500/40 hover:bg-zinc-900"
                >
                  <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
                    {o.status}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-zinc-100">
                    {o.customer_first_name ?? 'Client'} · {o.dropoff_line1 ?? '—'}
                  </span>
                  {o.delivery_fee_ron != null ? (
                    <span className="shrink-0 text-violet-300">
                      +{Number(o.delivery_fee_ron).toFixed(2)} RON
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Recent deliveries */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          Livrări recente ({delivered.length})
        </p>
        {delivered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950 px-4 py-5 text-center text-xs text-zinc-500">
            Nicio livrare în ultimele 30 zile.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {delivered.slice(0, 12).map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-3 py-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-zinc-100">
                    {o.customer_first_name ?? 'Client'}
                  </p>
                  <p className="truncate text-zinc-500">
                    {o.dropoff_line1 ?? '—'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className="text-emerald-300">
                    +{Number(o.delivery_fee_ron ?? 0).toFixed(2)} RON
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    {new Date(o.updated_at).toLocaleString('ro-RO', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden>{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
        <p className="truncate text-sm font-medium text-zinc-100">{value}</p>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-xl font-semibold text-zinc-100">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}
