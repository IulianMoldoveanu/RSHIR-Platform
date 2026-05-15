import { Bike, Car, Phone, Truck, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFleetManager } from '@/lib/fleet-manager';
import { CourierStatusActions } from './_actions';

export const dynamic = 'force-dynamic';

type CourierRow = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  vehicle_type: 'BIKE' | 'SCOOTER' | 'CAR';
  status: 'INACTIVE' | 'ACTIVE' | 'SUSPENDED';
};

type ShiftRow = {
  courier_user_id: string;
  started_at: string;
  last_seen_at: string | null;
};

type DeliveredRow = {
  assigned_courier_user_id: string;
  delivery_fee_ron: number | null;
};

type ActiveOrderRow = {
  assigned_courier_user_id: string;
  status: string;
};

const VEHICLE_ICON: Record<CourierRow['vehicle_type'], React.ReactNode> = {
  BIKE: <Bike className="h-3.5 w-3.5" aria-hidden />,
  SCOOTER: <Truck className="h-3.5 w-3.5" aria-hidden />,
  CAR: <Car className="h-3.5 w-3.5" aria-hidden />,
};

const VEHICLE_LABEL: Record<CourierRow['vehicle_type'], string> = {
  BIKE: 'Bicicletă',
  SCOOTER: 'Scuter',
  CAR: 'Mașină',
};

const STATUS_BADGE: Record<CourierRow['status'], { label: string; tone: string }> = {
  ACTIVE: { label: 'Activ', tone: 'bg-emerald-500/10 text-emerald-300' },
  INACTIVE: { label: 'Inactiv', tone: 'bg-hir-border text-hir-muted-fg' },
  SUSPENDED: { label: 'Suspendat', tone: 'bg-amber-500/10 text-amber-300' },
};

function formatRoPhone(raw: string | null): string {
  if (!raw) return '—';
  // E.164 → "+40 7XX XXX XXX" for RO numbers; otherwise pass through.
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('40') && digits.length === 11) {
    return `+40 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return raw;
}

export default async function FleetCouriersPage() {
  const fleet = await requireFleetManager();
  const admin = createAdminClient();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: couriersData } = await admin
    .from('courier_profiles')
    .select('user_id, full_name, phone, vehicle_type, status')
    .eq('fleet_id', fleet.fleetId)
    .order('full_name', { ascending: true });

  const couriers = (couriersData ?? []) as CourierRow[];
  const ids = couriers.map((c) => c.user_id);

  // Pull online shifts + today's deliveries + currently-running orders in
  // parallel; combine in memory keyed by user_id. Quiet failure-paths: if any
  // of these come back empty, the row just shows zeros / offline.
  const [{ data: shiftsData }, { data: deliveredData }, { data: activeOrdersData }] =
    ids.length > 0
      ? await Promise.all([
          admin
            .from('courier_shifts')
            .select('courier_user_id, started_at, last_seen_at')
            .in('courier_user_id', ids)
            .eq('status', 'ONLINE'),
          // fleet_id filter keeps stats isolated. A courier could have
          // historical orders attached to another fleet_id (rider moved
          // between fleets, or rare cross-fleet legacy rows); without this
          // filter the dashboard would inflate today's delivery + active
          // counts with rows that don't belong to this manager.
          admin
            .from('courier_orders')
            .select('assigned_courier_user_id, delivery_fee_ron')
            .eq('fleet_id', fleet.fleetId)
            .in('assigned_courier_user_id', ids)
            .eq('status', 'DELIVERED')
            .gte('updated_at', startOfDay.toISOString()),
          admin
            .from('courier_orders')
            .select('assigned_courier_user_id, status')
            .eq('fleet_id', fleet.fleetId)
            .in('assigned_courier_user_id', ids)
            .in('status', ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

  const shifts = (shiftsData ?? []) as ShiftRow[];
  const delivered = (deliveredData ?? []) as DeliveredRow[];
  const activeOrders = (activeOrdersData ?? []) as ActiveOrderRow[];

  const onlineSet = new Set(shifts.map((s) => s.courier_user_id));
  const lastSeenMap = new Map(shifts.map((s) => [s.courier_user_id, s.last_seen_at]));
  const todayCount = new Map<string, number>();
  const todayRevenue = new Map<string, number>();
  for (const row of delivered) {
    todayCount.set(row.assigned_courier_user_id, (todayCount.get(row.assigned_courier_user_id) ?? 0) + 1);
    todayRevenue.set(
      row.assigned_courier_user_id,
      (todayRevenue.get(row.assigned_courier_user_id) ?? 0) + (Number(row.delivery_fee_ron) || 0),
    );
  }
  const activeCount = new Map<string, number>();
  for (const row of activeOrders) {
    activeCount.set(row.assigned_courier_user_id, (activeCount.get(row.assigned_courier_user_id) ?? 0) + 1);
  }

  // Sort: online first, then by today's delivery count desc, then by name.
  const sorted = [...couriers].sort((a, b) => {
    const aOn = onlineSet.has(a.user_id) ? 1 : 0;
    const bOn = onlineSet.has(b.user_id) ? 1 : 0;
    if (aOn !== bOn) return bOn - aOn;
    const aDel = todayCount.get(a.user_id) ?? 0;
    const bDel = todayCount.get(b.user_id) ?? 0;
    if (aDel !== bDel) return bDel - aDel;
    return (a.full_name ?? '').localeCompare(b.full_name ?? '');
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-hir-fg">Curieri</h1>
          <p className="mt-1 text-sm text-hir-muted-fg">
            {couriers.length} {couriers.length === 1 ? 'curier' : 'curieri'} în flotă ·{' '}
            <span className="text-emerald-300">{onlineSet.size} online</span>
          </p>
        </div>
        <Link
          href="/fleet/couriers/invite"
          className="inline-flex items-center gap-1.5 rounded-xl bg-violet-500 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-400"
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          Invită
        </Link>
      </div>

      {couriers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hir-border bg-hir-surface px-6 py-10 text-center">
          <p className="text-sm font-medium text-hir-fg">Niciun curier încă</p>
          <p className="mt-1 text-xs text-hir-muted-fg">
            Invită primul curier din butonul de mai sus.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((c) => {
            const isOnline = onlineSet.has(c.user_id);
            const lastSeen = lastSeenMap.get(c.user_id);
            const statusBadge = STATUS_BADGE[c.status];
            const inProgress = activeCount.get(c.user_id) ?? 0;
            const todayN = todayCount.get(c.user_id) ?? 0;
            const todayR = todayRevenue.get(c.user_id) ?? 0;

            return (
              <li
                key={c.user_id}
                className="rounded-2xl border border-hir-border bg-hir-surface p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      aria-label={isOnline ? 'Online' : 'Offline'}
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        isOnline ? 'bg-emerald-400 ring-2 ring-emerald-400/30' : 'bg-zinc-700'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/fleet/couriers/${c.user_id}`}
                        className="truncate text-sm font-semibold text-hir-fg hover:text-violet-300"
                      >
                        {c.full_name ?? 'Curier'}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-hir-muted-fg">
                        <span className="inline-flex items-center gap-1">
                          {VEHICLE_ICON[c.vehicle_type]}
                          {VEHICLE_LABEL[c.vehicle_type]}
                        </span>
                        {c.phone ? (
                          <a
                            href={`tel:${c.phone}`}
                            className="inline-flex items-center gap-1 text-violet-300 hover:text-violet-200"
                          >
                            <Phone className="h-3 w-3" aria-hidden />
                            {formatRoPhone(c.phone)}
                          </a>
                        ) : null}
                        {!isOnline && lastSeen ? (
                          <span className="text-hir-muted-fg">
                            văzut {new Date(lastSeen).toLocaleTimeString('ro-RO', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadge.tone}`}
                  >
                    {statusBadge.label}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-hir-border pt-3 text-center">
                  <Mini label="În curs" value={String(inProgress)} />
                  <Mini label="Livrate azi" value={String(todayN)} />
                  <Mini label="Câștig azi" value={`${todayR.toFixed(2)} RON`} />
                </div>

                <div className="mt-3 flex justify-end border-t border-hir-border pt-3">
                  <CourierStatusActions userId={c.user_id} status={c.status} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-hir-fg">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-hir-muted-fg">{label}</p>
    </div>
  );
}
