import Link from 'next/link';
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  Lightbulb,
  Package,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFleetManager } from '@/lib/fleet-manager';
import { FleetLiveMap, type FleetRiderPin } from './fleet-live-map';
import { FleetOverviewRefresh } from './fleet-overview-refresh';
import { OrderStatusBadge } from '@/components/order-status-badge';

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

  // Couriers come first because the shift query needs their IDs to scope.
  // A naive global `.limit(200)` would let busy fleets push this fleet's
  // riders out of the result window, breaking online counts + map pins.
  const { data: couriersData } = await admin
    .from('courier_profiles')
    .select('user_id, full_name, status')
    .eq('fleet_id', fleet.fleetId);
  const fleetCourierIds = ((couriersData ?? []) as Array<{ user_id: string }>).map((c) => c.user_id);

  const [
    { data: shiftsData },
    { data: openOrdersData },
    { data: activeOrdersData },
    { data: deliveredTodayData },
  ] = await Promise.all([
    // Shifts scoped to the fleet's riders. ONLINE rows always surface; we
    // also include the most recent OFFLINE shift per rider so the map can
    // show last-known positions for riders who closed their shift recently.
    fleetCourierIds.length > 0
      ? admin
          .from('courier_shifts')
          .select('courier_user_id, status, last_lat, last_lng, last_seen_at, started_at')
          .in('courier_user_id', fleetCourierIds)
          .order('started_at', { ascending: false })
          .limit(Math.max(200, fleetCourierIds.length * 3))
      : Promise.resolve({ data: [] }),
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

  // Onboarding state: empty fleet → big "first courier" CTA above all
  // the empty KPIs. Once at least one rider is invited, the normal grid
  // takes over. Inactive fleet → red banner replaces the onboarding card.
  const isEmptyFleet = totalCouriers === 0;
  const onboardingHints: Array<{ done: boolean; label: string }> = [
    { done: !!fleet.contactPhone, label: 'Setează telefon dispecer' },
    { done: totalCouriers > 0, label: 'Invită primul curier' },
    { done: onlineCouriers > 0, label: 'Curier online' },
    { done: todayCount > 0 || activeOrders.length > 0, label: 'Prima comandă procesată' },
  ];
  const completedHints = onboardingHints.filter((h) => h.done).length;
  const surfaceOnboarding = completedHints < onboardingHints.length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <FleetOverviewRefresh />
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-hir-fg">Privire de ansamblu</h1>
        <p className="mt-1 text-sm text-hir-muted-fg">
          Stare flotă în timp real — comenzi, curieri, încasări azi.
        </p>
      </div>

      {/* Inactive fleet banner — manager can still browse but actions are
          gated server-side by `is_active` once we wire that gate. */}
      {!fleet.isActive ? (
        <div className="rounded-2xl border border-amber-700/40 bg-amber-500/5 p-4">
          <p className="text-sm font-semibold text-amber-200">Flotă inactivă</p>
          <p className="mt-1 text-xs text-amber-200/80">
            Contactează echipa HIR pentru reactivare. Dispecerul nu poate
            primi comenzi noi cât timp flota este dezactivată.
          </p>
        </div>
      ) : null}

      {/* Onboarding checklist — visible until all four steps complete. */}
      {fleet.isActive && surfaceOnboarding ? (
        <section className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-violet-300" aria-hidden />
              <h2 className="text-sm font-semibold text-hir-fg">
                Pași pentru a deveni operațional
              </h2>
            </div>
            <span className="text-[11px] font-semibold text-violet-300">
              {completedHints}/{onboardingHints.length}
            </span>
          </div>
          <ul className="space-y-1.5 text-xs">
            {onboardingHints.map((h) => (
              <li key={h.label} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    h.done ? 'bg-emerald-500/20 text-emerald-300' : 'bg-hir-border text-hir-muted-fg'
                  }`}
                >
                  {h.done ? '✓' : '·'}
                </span>
                <span className={h.done ? 'text-hir-muted-fg line-through' : 'text-hir-fg'}>
                  {h.label}
                </span>
              </li>
            ))}
          </ul>
          {isEmptyFleet ? (
            <Link
              href="/fleet/couriers/invite"
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-violet-500 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-400"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden />
              Invită primul curier
            </Link>
          ) : null}
        </section>
      ) : null}

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
          <h2 className="text-sm font-semibold text-hir-fg">Locații curieri</h2>
          <p className="text-[11px] text-hir-muted-fg">
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
      <section className="rounded-2xl border border-hir-border bg-hir-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-hir-fg">
            Comenzi neasignate{' '}
            <span className="text-hir-muted-fg">({openOrders.length})</span>
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
                className="rounded-xl border border-hir-border bg-zinc-950 px-3 py-2 text-center text-xs font-medium text-hir-muted-fg hover:bg-hir-surface"
              >
                +{openOrders.length - 5} comenzi · vezi toate
              </Link>
            ) : null}
          </ul>
        )}
      </section>

      {/* Active orders */}
      <section className="rounded-2xl border border-hir-border bg-hir-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-hir-fg">
            În curs <span className="text-hir-muted-fg">({activeOrders.length})</span>
          </h2>
          <Link
            href="/fleet/orders"
            className="inline-flex items-center gap-1 text-xs font-medium text-hir-muted-fg hover:text-hir-fg"
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
    <div className="rounded-2xl border border-hir-border bg-hir-surface p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-hir-muted-fg">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-xl font-semibold text-hir-fg">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-hir-muted-fg">{hint}</p> : null}
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return (
    <div className="rounded-xl border border-dashed border-hir-border bg-zinc-950 px-4 py-6 text-center text-xs text-hir-muted-fg">
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
        className="block rounded-xl border border-hir-border bg-zinc-950 p-3 hover:border-violet-500/40 hover:bg-hir-surface"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <OrderStatusBadge status={order.status} />
              <p className="truncate text-sm font-medium text-hir-fg">
                {order.customer_first_name ?? 'Client'}
              </p>
              {order.delivery_fee_ron != null ? (
                <span className="text-xs font-medium text-violet-300">
                  +{Number(order.delivery_fee_ron).toFixed(2)} RON
                </span>
              ) : null}
            </div>
            <p className="mt-1 truncate text-xs text-hir-muted-fg">
              {order.pickup_line1 ?? '—'} → {order.dropoff_line1 ?? '—'}
            </p>
            {courierName ? (
              <p className="mt-1 text-[11px] text-hir-muted-fg">
                Curier: <span className="text-hir-fg">{courierName}</span>
              </p>
            ) : null}
          </div>
          <span className="text-[10px] text-hir-muted-fg">{formatAge(order.created_at)}</span>
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
      className="flex items-center gap-3 rounded-2xl border border-hir-border bg-hir-surface px-4 py-3 hover:border-violet-500/40 hover:bg-hir-surface/70"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/10 text-violet-300">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-hir-fg">{label}</p>
        <p className="text-xs text-hir-muted-fg">{hint}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-hir-muted-fg" aria-hidden />
    </Link>
  );
}
