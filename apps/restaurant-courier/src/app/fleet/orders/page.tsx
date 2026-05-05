import Link from 'next/link';
import { History, Inbox } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFleetManager } from '@/lib/fleet-manager';
import { resolveTenantNames } from '@/lib/tenant-names';
import { OrderRow, type DispatchOrder, type DispatchCourier } from './_row';
import { FleetOrdersVirtualList } from './fleet-orders-virtual-list';
import { FleetOrdersRealtime } from './fleet-orders-realtime';
import { FleetOrdersSearch } from './fleet-orders-search';
import { BulkAutoAssignButton } from './bulk-auto-assign-button';

export const dynamic = 'force-dynamic';

const ACTIVE_STATUSES = ['CREATED', 'OFFERED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'];

const ORDER_COLS =
  'id, status, customer_first_name, customer_phone, pickup_line1, dropoff_line1, total_ron, delivery_fee_ron, payment_method, assigned_courier_user_id, source_tenant_id, created_at, updated_at';

export default async function FleetOrdersPage() {
  const fleet = await requireFleetManager();
  const admin = createAdminClient();

  // Pull both unassigned + assigned-active orders in one round-trip; split
  // client-side. Sort: open first (oldest first → SLA pressure), then active.
  const [{ data: ordersData }, { data: couriersData }, { data: shiftsData }] =
    await Promise.all([
      admin
        .from('courier_orders')
        .select(ORDER_COLS)
        .eq('fleet_id', fleet.fleetId)
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: true })
        .limit(60),
      admin
        .from('courier_profiles')
        .select('user_id, full_name, vehicle_type')
        .eq('fleet_id', fleet.fleetId)
        .order('full_name', { ascending: true }),
      admin
        .from('courier_shifts')
        .select('courier_user_id')
        .eq('status', 'ONLINE'),
    ]);

  const orders = (ordersData ?? []) as DispatchOrder[];
  const couriers = (couriersData ?? []) as DispatchCourier[];
  const onlineSet = new Set(((shiftsData ?? []) as Array<{ courier_user_id: string }>).map((s) => s.courier_user_id));

  // Resolve tenant names for the rows we just fetched. Multi-restaurant
  // fleets need this to disambiguate pickups; single-restaurant fleets
  // get a one-entry map and the row UI hides the chip when the tenant
  // count is 1.
  const tenantNames = await resolveTenantNames(orders.map((o) => o.source_tenant_id));
  const distinctTenantCount = tenantNames.size;
  const showTenantChip = distinctTenantCount > 1;

  // Annotate couriers with online state — UI surfaces online riders first.
  const annotatedCouriers = couriers
    .map((c) => ({ ...c, online: onlineSet.has(c.user_id) }))
    .sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      return (a.full_name ?? '').localeCompare(b.full_name ?? '');
    });

  const open = orders.filter((o) => o.assigned_courier_user_id === null);
  const active = orders.filter((o) => o.assigned_courier_user_id !== null);
  const courierName = new Map(couriers.map((c) => [c.user_id, c.full_name ?? '—']));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <FleetOrdersRealtime fleetId={fleet.fleetId} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Comenzi flotă</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {open.length} neasignate · {active.length} în curs ·{' '}
            {annotatedCouriers.filter((c) => c.online).length} curieri online
            {distinctTenantCount > 1 ? (
              <>
                {' · '}
                <span className="text-zinc-300">
                  {distinctTenantCount} restaurante
                </span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <BulkAutoAssignButton openCount={open.length} />
          <Link
            href="/fleet/orders/history"
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
          >
            <History className="h-3.5 w-3.5" aria-hidden />
            Istoric
          </Link>
        </div>
      </div>

      <FleetOrdersSearch />

      {/* Hidden by default; FleetOrdersSearch toggles display when query
          matches no rows. id is consumed by the script in that component. */}
      <p
        id="fleet-orders-search-empty"
        className="hidden rounded-xl border border-dashed border-zinc-800 bg-zinc-950 px-4 py-3 text-center text-xs text-zinc-500"
      >
        Nicio comandă nu se potrivește cu căutarea.
      </p>

      <Section title="Neasignate" count={open.length} accent="amber">
        {open.length === 0 ? (
          <Empty
            icon={<Inbox className="h-5 w-5" aria-hidden />}
            hint="Toate comenzile au curier asignat."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                couriers={annotatedCouriers}
                courierName={null}
                tenantName={
                  showTenantChip && o.source_tenant_id
                    ? (tenantNames.get(o.source_tenant_id) ?? null)
                    : null
                }
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title="În curs" count={active.length} accent="violet">
        {active.length === 0 ? (
          <Empty
            icon={<Inbox className="h-5 w-5" aria-hidden />}
            hint="Nicio comandă activă în acest moment."
          />
        ) : (
          <FleetOrdersVirtualList
            orders={active}
            couriers={annotatedCouriers}
            courierNameEntries={[...courierName.entries()]}
            tenantNameEntries={[...tenantNames.entries()]}
            showTenantChip={showTenantChip}
          />
        )}
      </Section>

      <Link
        href="/fleet"
        className="text-center text-xs text-zinc-500 hover:text-zinc-300"
      >
        Înapoi la privire
      </Link>
    </div>
  );
}

function Section({
  title,
  count,
  accent,
  children,
}: {
  title: string;
  count: number;
  accent: 'amber' | 'violet';
  children: React.ReactNode;
}) {
  const accentClass =
    accent === 'amber' ? 'bg-amber-500/10 text-amber-300' : 'bg-violet-500/10 text-violet-300';
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {title}
        <span className={`rounded-full px-2 py-0.5 text-[10px] ${accentClass}`}>{count}</span>
      </h2>
      {children}
    </section>
  );
}

function Empty({ icon, hint }: { icon: React.ReactNode; hint: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-800 bg-zinc-950 px-4 py-5 text-xs text-zinc-500">
      <span aria-hidden>{icon}</span>
      <span>{hint}</span>
    </div>
  );
}
