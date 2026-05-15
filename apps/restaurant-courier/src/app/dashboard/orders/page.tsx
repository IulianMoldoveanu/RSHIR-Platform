import Link from 'next/link';
import { Inbox, MapPinned, Navigation, RefreshCw } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { VerticalBadge } from '@/components/vertical-badge';
import { OrderStatusBadge } from '@/components/order-status-badge';
import { TenantBadge } from '@/components/tenant-badge';
import { refreshOrdersAction } from '../actions';
import { OrdersRealtime } from './orders-realtime';
import { resolveRiderMode } from '@/lib/rider-mode';

export const dynamic = 'force-dynamic';

type OrderRow = {
  id: string;
  status: string;
  vertical: 'restaurant' | 'pharma';
  customer_first_name: string | null;
  pickup_line1: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_line1: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  total_ron: number | null;
  delivery_fee_ron: number | null;
  created_at: string;
  source_tenant_id: string | null;
};

const ACTIVE_STATUSES = ['CREATED', 'OFFERED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'];

const ORDER_COLUMNS =
  'id, status, vertical, customer_first_name, pickup_line1, pickup_lat, pickup_lng, dropoff_line1, dropoff_lat, dropoff_lng, total_ron, delivery_fee_ron, created_at, source_tenant_id';

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

function formatAge(createdAt: string): string {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return '';
  const diffMin = Math.floor((Date.now() - created) / 60_000);
  if (diffMin < 1) return 'acum';
  if (diffMin < 60) return `acum ${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  return `acum ${diffH}h`;
}

export default async function OrdersPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  const [{ data: assignedData }, { data: openData }, riderMode, { data: profileData }] =
    await Promise.all([
      admin
        .from('courier_orders')
        .select(ORDER_COLUMNS)
        .eq('assigned_courier_user_id', user.id)
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: false }),
      // Available orders are sorted OLDEST first so couriers naturally pick
      // the order closest to its SLA breach. Assigned orders above stay
      // newest-first because the rider already chose them.
      admin
        .from('courier_orders')
        .select(ORDER_COLUMNS)
        .is('assigned_courier_user_id', null)
        .in('status', ['CREATED', 'OFFERED'])
        .order('created_at', { ascending: true })
        .limit(20),
      resolveRiderMode(user.id),
      // Realtime needs the rider's own fleet_id (always backfilled, even for
      // Mode A/B on the platform-default fleet) to subscribe to fresh
      // OFFERED orders. resolveRiderMode returns null for Mode A/B by design,
      // so we read the column directly here.
      admin
        .from('courier_profiles')
        .select('fleet_id')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

  // Sort assigned orders by status priority so the prefix number always
  // reflects what the rider should do next: PICKED_UP first (in transit),
  // then ACCEPTED (needs pickup), then anything else. Tie-break on
  // created_at desc (already the SQL order).
  const STATUS_SORT_PRIORITY: Record<string, number> = {
    PICKED_UP: 0,
    IN_TRANSIT: 0,
    ACCEPTED: 1,
    CREATED: 2,
    OFFERED: 3,
  };
  const assigned = ((assignedData ?? []) as OrderRow[]).slice().sort((a, b) => {
    const pa = STATUS_SORT_PRIORITY[a.status] ?? 99;
    const pb = STATUS_SORT_PRIORITY[b.status] ?? 99;
    return pa - pb;
  });
  const open = (openData ?? []) as OrderRow[];

  // Mode C riders are dispatched by their fleet manager — they don't
  // browse open orders; surfacing the section is a useless affordance.
  const showOpenOrders = riderMode.mode !== 'C';

  const fleetId =
    (profileData as { fleet_id: string | null } | null)?.fleet_id ?? null;

  // Mode B riders see orders from multiple tenants — surface the
  // restaurant/pharmacy name on each card so they can distinguish
  // "Foișorul A" from "Pizza Diavola" before tapping. One lookup, batched
  // across both lists. Resolved tenant names only — Mode A/C riders get
  // an empty map and the badge component renders nothing.
  const tenantNameById = new Map<string, string>();
  if (riderMode.mode === 'B') {
    const tenantIds = Array.from(
      new Set(
        [...assigned, ...open]
          .map((o) => o.source_tenant_id)
          .filter((id): id is string => !!id),
      ),
    );
    if (tenantIds.length > 0) {
      const { data: tenantRows } = await admin
        .from('tenants')
        .select('id, name')
        .in('id', tenantIds);
      for (const row of (tenantRows ?? []) as Array<{ id: string; name: string | null }>) {
        if (row.name) tenantNameById.set(row.id, row.name);
      }
    }
  }
  const isModeB = riderMode.mode === 'B';

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <OrdersRealtime
        courierUserId={user.id}
        fleetId={fleetId}
        watchFleetOpenOrders={showOpenOrders}
      />
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-hir-fg">Comenzi</h1>
        <form action={refreshOrdersAction}>
          <button
            type="submit"
            aria-label="Reîmprospătează"
            className="inline-flex items-center gap-1.5 rounded-lg border border-hir-border bg-hir-surface px-3 py-2 text-xs font-medium text-hir-fg hover:bg-hir-border active:scale-95"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Actualizează
          </button>
        </form>
      </div>

      <Section title="Comenzile mele" count={assigned.length}>
        {assigned.length === 0 ? (
          <Empty
            icon={<Inbox className="h-5 w-5" aria-hidden />}
            title="Nicio comandă activă"
            hint="Te anunțăm imediat ce apare o comandă pentru tine."
            // CTA nudges the rider to the live-map view where they can
            // see pickups + dropoffs spatially while waiting. Skipped for
            // Mode-C riders (dispatched externally — map view is read-only
            // for them and the section above them is enough).
            {...(showOpenOrders
              ? { ctaHref: '/dashboard', ctaLabel: 'Vezi harta' }
              : {})}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {assigned.map((o, idx) => (
              <OrderListItem
                key={o.id}
                order={o}
                seqNumber={idx + 1}
                tenantName={isModeB ? tenantNameById.get(o.source_tenant_id ?? '') ?? null : null}
              />
            ))}
          </ul>
        )}
      </Section>

      {showOpenOrders ? (
        <Section title="Comenzi disponibile" count={open.length}>
          {open.length === 0 ? (
            <Empty
              icon={<MapPinned className="h-5 w-5" aria-hidden />}
              title="Nicio comandă liberă în zonă"
              hint="Verifică din nou peste câteva minute sau privește harta din pagina principală."
              ctaHref="/dashboard"
              ctaLabel="Deschide harta"
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {open.map((o) => (
                <OrderListItem
                  key={o.id}
                  order={o}
                  tenantName={isModeB ? tenantNameById.get(o.source_tenant_id ?? '') ?? null : null}
                />
              ))}
            </ul>
          )}
        </Section>
      ) : null}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-hir-muted-fg">
        {title}
        {count > 0 ? (
          <span className="rounded-full bg-hir-border px-1.5 py-0.5 text-[10px] font-bold text-hir-fg">
            {count}
          </span>
        ) : null}
      </h2>
      {children}
    </section>
  );
}

function Empty({
  icon,
  title,
  hint,
  ctaHref,
  ctaLabel,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  // Optional CTA — renders only when both fields are provided. Keeps
  // the existing "icon + title + hint" empty state usable in places
  // where there's no obvious next action (e.g. "we'll notify you when
  // an order arrives") without forcing a button that does nothing.
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-hir-border bg-hir-surface px-6 py-8 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-hir-border text-hir-muted-fg">
        {icon}
      </span>
      <p className="text-sm font-medium text-hir-fg">{title}</p>
      <p className="text-xs text-hir-muted-fg">{hint}</p>
      {ctaHref && ctaLabel ? (
        <Link
          href={ctaHref}
          className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-200 hover:border-violet-400 hover:bg-violet-500/15"
        >
          {ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}

function OrderListItem({
  order,
  seqNumber,
  tenantName,
}: {
  order: OrderRow;
  seqNumber?: number;
  // Mode B only — populated when the rider has memberships across
  // 2+ tenants and therefore needs the source restaurant/pharmacy name
  // surfaced on each card. Null on Mode A/C; <TenantBadge> renders
  // nothing for null.
  tenantName?: string | null;
}) {
  const hasRoute =
    order.pickup_lat != null &&
    order.pickup_lng != null &&
    order.dropoff_lat != null &&
    order.dropoff_lng != null;
  const distanceKm = hasRoute
    ? haversineKm(
        order.pickup_lat as number,
        order.pickup_lng as number,
        order.dropoff_lat as number,
        order.dropoff_lng as number,
      )
    : null;
  // Rough ETA: assume 25 km/h average for mixed urban traffic.
  const etaMin = distanceKm != null ? Math.ceil((distanceKm / 25) * 60) : null;

  return (
    <li>
      <Link
        href={`/dashboard/orders/${order.id}`}
        className="block rounded-2xl border border-hir-border bg-hir-surface p-4 transition-colors hover:border-violet-500/50 hover:bg-hir-border/60 active:scale-[0.99]"
      >
        {/* Top row: customer + vertical badge + status chip */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {seqNumber != null ? (
              <span
                aria-label={`Comanda ${seqNumber}`}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500 text-[10px] font-bold text-white"
              >
                {seqNumber}
              </span>
            ) : null}
            <p className="truncate text-sm font-semibold text-hir-fg">
              {order.customer_first_name ?? 'Client'}
            </p>
            <VerticalBadge vertical={order.vertical ?? 'restaurant'} />
            <TenantBadge name={tenantName ?? null} />
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        {/* Route line */}
        <p className="mt-1.5 truncate text-xs text-hir-muted-fg">
          {order.pickup_line1 ?? '—'} → {order.dropoff_line1 ?? '—'}
        </p>

        {/* Distance + ETA + fee row */}
        <div className="mt-2.5 flex items-center gap-3">
          {distanceKm != null ? (
            <span className="flex items-center gap-1 rounded-lg bg-hir-border px-2 py-1 text-[11px] font-medium text-hir-fg">
              <Navigation className="h-3 w-3 text-violet-300" aria-hidden />
              {distanceKm.toFixed(1)} km
            </span>
          ) : null}
          {etaMin != null ? (
            <span className="text-[11px] text-hir-muted-fg">~{etaMin} min</span>
          ) : null}
          {order.delivery_fee_ron != null ? (
            <span className="ml-auto text-xs font-semibold text-emerald-300">
              +{Number(order.delivery_fee_ron).toFixed(2)} RON
            </span>
          ) : null}
          {order.delivery_fee_ron == null ? (
            <span className="ml-auto text-[10px] text-hir-muted-fg">{formatAge(order.created_at)}</span>
          ) : (
            <span className="text-[10px] text-hir-muted-fg">{formatAge(order.created_at)}</span>
          )}
        </div>
      </Link>
    </li>
  );
}
