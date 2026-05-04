import Link from 'next/link';
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  Package,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFleetManager } from '@/lib/fleet-manager';
import { FleetLiveMap, type FleetRiderPin } from './fleet-live-map';

export const dynamic = 'force-dynamic';

type CourierRow = {
  user_id: string;
  full_name: string | null;
  status: 'INACTIVE' | 'ACTIVE' | 'SUSPENDED';
};

type ShiftRow = {
  courier_user_id: string;
  status: 'ONLINE' | 'OFFLINE';
  last_lat: number | null;
  last_lng: number | null;
  last_seen_at: string | null;
  started_at: string;
};

type OrderSnapshot = {
  id: string;
  status: string;
  delivery_fee_ron: number | null;
  customer_first_name: string | null;
  pickup_line1: string | null;
  dropoff_line1: string | null;
  assigned_courier_user_id: string | null;
  created_at: string;
  updated_at: string | null;
};

const ACTIVE_STATUSES = ['CREATED', 'OFFERED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'];

const STATUS_TONE: Record<string, string> = {
  CREATED: 'bg-zinc-800 text-zinc-300',
  OFFERED: 'bg-amber-500/10 text-amber-300',
  ACCEPTED: 'bg-violet-500/10 text-violet-300',
  PICKED_UP: 'bg-sky-500/10 text-sky-300',
  IN_TRANSIT: 'bg-sky-500/10 text-sky-300',
  DELIVERED: 'bg-emerald-500/10 text-emerald-300',
};

const STATUS_LABEL: Record<string, string> = {
  CREATED: 'Nouă',
  OFFERED: 'Oferită',
  ACCEPTED: 'Acceptată',
  PICKED_UP: 'Ridicată',
  IN_TRANSIT: 'În livrare',
  DELIVERED: 'Livrată',
};

function formatAge(dateIso: string): string {
  const ms = Date.now() - new Date(dateIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'acum';
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h`;
}

export default async function FleetOverviewPage() {
  const fleet = await requireFleetManager();
  const admin = createAdminClient();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    { data: couriersData },
    { data: shiftsData },
    { data: openOrdersData },
    { data: activeOrdersData },
    { data: deliveredTodayData },
  ] = await Promise.all([
    // All couriers in the fleet (used for total + active count).
    admin
      .from('courier_profiles')
      .select('user_id, full_name, status')
      .eq('fleet_id', fleet.fleetId),
    // Currently online shifts + last GPS fix — drives the live map and the
    // "online" KPI. We pull the most recent shift per rider, online or not,
    // because the map can usefully show the last-known position of a rider
    // who just went offline 5 minutes ago.
    admin
      .from('courier_shifts')
      .select('courier_user_id, status, last_lat, last_lng, last_seen_at, started_at')
      .order('started_at', { ascending: false })
      .limit(200),
    // Unassigned orders for this fleet — manager attention list.
    admin
      .from('courier_orders')
      .select(
        'id, status, delivery_fee_ron, customer_first_name, pickup_line1, dropoff_line1, assigned_courier_user_id, created_at, updated_at',
      )
      .eq('fleet_id', fleet.fleetId)
      .is('assigned_courier_user_id', null)
      .in('status', ['CREATED', 'OFFERED'])
      .order('created_at', { ascending: true })
      .limit(20),
    // Active assigned orders — what's running right now.
    admin
      .from('courier_orders')
      .select(
        'id, status, delivery_fee_ron, customer_first_name, pickup_line1, dropoff_line1, assigned_courier_user_id, created_at, updated_at',
      )
      .eq('fleet_id', fleet.fleetId)
      .not('assigned_courier_user_id', 'is', null)
      .in('status', ACTIVE_STATUSES)
      .order('updated_at', { ascending: false })
      .limit(20),
    // Today's delivered orders — drives revenue + count KPI.
    admin
      .from('courier_orders')
      .select('delivery_fee_ron')
      .eq('fleet_id', fleet.fleetId)
      .eq('status', 'DELIVERED')
      .gte('updated_at', startOfDay.toISOString()),
  ]);

  const couriers = (couriersData ?? []) as CourierRow[];
  const shifts = (shiftsData ?? []) as ShiftRow[];
  const openOrders = (openOrdersData ?? []) as OrderSnapshot[];
  const activeOrders = (activeOrdersData ?? []) as OrderSnapshot[];
  const deliveredToday = (deliveredTodayData ?? []) as Array<{ delivery_fee_ron: number | null }>;

  // A rider is "online" if they have an ONLINE shift AND belong to this fleet.
  const fleetUserIds = new Set(couriers.map((c) => c.user_id));
  const onlineCouriers = shifts.filter(
    (s) => s.status === 'ONLINE' && fleetUserIds.has(s.courier_user_id),
  ).length;
  const totalCouriers = couriers.length;
  const activeCouriers = couriers.filter((c) => c.status === 'ACTIVE').length;

  const todayRevenue = deliveredToday.reduce(
    (sum, row) => sum + (Number(row.delivery_fee_ron) || 0),
    0,
  );
  const todayCount = deliveredToday.length;

  const courierName = new Map(couriers.map((c) => [c.user_id, c.full_name ?? '—']));

  // Build pins for the live map: take the most recent shift row per rider
  // (the SELECT was ordered by started_at desc) that has GPS coords. Most
  // recent row wins; older shifts for the same rider are skipped.
  const seenRiders = new Set<string>();
  const inProgressByRider = new Map<string, number>();
  for (const o of activeOrders) {
    if (!o.assigned_courier_user_id) continue;
    inProgressByRider.set(
      o.assigned_courier_user_id,
      (inProgressByRider.get(o.assigned_courier_user_id) ?? 0) + 1,
    );
  }
  const ridersWithFleet = new Set(couriers.map((c) => c.user_id));
  const livePins: FleetRiderPin[] = [];
  for (const s of shifts) {
    if (seenRiders.has(s.courier_user_id)) continue;
    if (!ridersWithFleet.has(s.courier_user_id)) continue;
    seenRiders.add(s.courier_user_id);
    if (s.last_lat == null || s.last_lng == null) continue;
    livePins.push({
      userId: s.courier_user_id,
      name: courierName.get(s.courier_user_id) ?? 'Curier',
      lat: s.last_lat,
      lng: s.last_lng,
      online: s.status === 'ONLINE',
      inProgressCount: inProgressByRider.get(s.courier_user_id) ?? 0,
    });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Privire de ansamblu</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Stare flotă în timp real — comenzi, curieri, încasări azi.
        </p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          icon={<UserCheck className="h-4 w-4 text-emerald-400" aria-hidden />}
          label="Online acum"
          value={`${onlineCouriers}/${totalCouriers}`}
          hint={`${activeCouriers} activi total`}
        />
        <Kpi
          icon={<Package className="h-4 w-4 text-violet-400" aria-hidden />}
          label="În livrare"
          value={String(activeOrders.length)}
          hint={`${openOrders.length} libere`}
        />
        <Kpi
          icon={<CheckCircle2 className="h-4 w-4 text-sky-400" aria-hidden />}
          label="Livrate azi"
          value={String(todayCount)}
        />
        <Kpi
          icon={<Banknote className="h-4 w-4 text-emerald-400" aria-hidden />}
          label="Încasări azi"
          value={`${todayRevenue.toFixed(2)} RON`}
          hint={
            todayCount > 0 ? `~${(todayRevenue / todayCount).toFixed(2)} RON/livrare` : undefined
          }
        />
      </div>

      {/* Live map — riders' last-known GPS; emerald = online idle, violet = carrying. */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">Locații curieri</h2>
          <p className="text-[11px] text-zinc-500">
            <span className="mr-2 inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
              Liber
            </span>
            <span className="mr-2 inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" aria-hidden />
              În curs
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" aria-hidden />
              Offline
            </span>
          </p>
        </div>
        <FleetLiveMap pins={livePins} />
      </section>

      {/* Open orders — red/amber attention bar */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">
            Comenzi neasignate{' '}
            <span className="text-zinc-500">({openOrders.length})</span>
          </h2>
          <Link
            href="/fleet/orders"
            className="inline-flex items-center gap-1 text-xs font-medium text-violet-300 hover:text-violet-200"
          >
            Asignează
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
        {openOrders.length === 0 ? (
          <Empty hint="Toate comenzile sunt asignate." />
        ) : (
          <ul className="flex flex-col gap-2">
            {openOrders.slice(0, 5).map((o) => (
              <OrderRow key={o.id} order={o} courierName={null} />
            ))}
            {openOrders.length > 5 ? (
              <Link
                href="/fleet/orders"
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-center text-xs font-medium text-zinc-300 hover:bg-zinc-900"
              >
                +{openOrders.length - 5} comenzi · vezi toate
              </Link>
            ) : null}
          </ul>
        )}
      </section>

      {/* Active orders */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">
            În curs <span className="text-zinc-500">({activeOrders.length})</span>
          </h2>
          <Link
            href="/fleet/orders"
            className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-zinc-200"
          >
            Toate
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
        {activeOrders.length === 0 ? (
          <Empty hint="Nicio comandă activă în acest moment." />
        ) : (
          <ul className="flex flex-col gap-2">
            {activeOrders.slice(0, 6).map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                courierName={
                  o.assigned_courier_user_id
                    ? (courierName.get(o.assigned_courier_user_id) ?? null)
                    : null
                }
              />
            ))}
          </ul>
        )}
      </section>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <QuickLink
          href="/fleet/couriers"
          icon={<Users className="h-4 w-4" aria-hidden />}
          label="Curieri"
          hint={`${onlineCouriers} online`}
        />
        <QuickLink
          href="/fleet/orders"
          icon={<Package className="h-4 w-4" aria-hidden />}
          label="Comenzi"
          hint={`${openOrders.length + activeOrders.length} în lucru`}
        />
        <QuickLink
          href="/fleet/earnings"
          icon={<TrendingUp className="h-4 w-4" aria-hidden />}
          label="Decontări"
          hint="Vezi raport"
        />
      </div>
    </div>
  );
}

function Kpi({
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
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-xl font-semibold text-zinc-100">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950 px-4 py-6 text-center text-xs text-zinc-500">
      {hint}
    </div>
  );
}

function OrderRow({
  order,
  courierName,
}: {
  order: OrderSnapshot;
  courierName: string | null;
}) {
  return (
    <li>
      <Link
        href={`/fleet/orders/${order.id}`}
        className="block rounded-xl border border-zinc-800 bg-zinc-950 p-3 hover:border-violet-500/40 hover:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_TONE[order.status] ?? 'bg-zinc-800 text-zinc-300'}`}
              >
                {STATUS_LABEL[order.status] ?? order.status}
              </span>
              <p className="truncate text-sm font-medium text-zinc-100">
                {order.customer_first_name ?? 'Client'}
              </p>
              {order.delivery_fee_ron != null ? (
                <span className="text-xs font-medium text-violet-300">
                  +{Number(order.delivery_fee_ron).toFixed(2)} RON
                </span>
              ) : null}
            </div>
            <p className="mt-1 truncate text-xs text-zinc-500">
              {order.pickup_line1 ?? '—'} → {order.dropoff_line1 ?? '—'}
            </p>
            {courierName ? (
              <p className="mt-1 text-[11px] text-zinc-400">
                Curier: <span className="text-zinc-200">{courierName}</span>
              </p>
            ) : null}
          </div>
          <span className="text-[10px] text-zinc-500">{formatAge(order.created_at)}</span>
        </div>
      </Link>
    </li>
  );
}

function QuickLink({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 hover:border-violet-500/40 hover:bg-zinc-900/70"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/10 text-violet-300">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-100">{label}</p>
        <p className="text-xs text-zinc-500">{hint}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-zinc-500" aria-hidden />
    </Link>
  );
}
