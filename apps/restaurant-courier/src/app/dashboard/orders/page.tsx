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
import { InsuranceStatusPill } from '@/components/insurance-status-pill';
import { TodaySummaryPill } from '@/components/today-summary-pill';
import { StaggerList } from '@/components/stagger-list';
import { RippleButton } from '@/components/ripple-button';
import { EmptyState } from '@/components/empty-state';

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
      <InsuranceStatusPill />
      <TodaySummaryPill />
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-hir-fg">Comenzi</h1>
        <form action={refreshOrdersAction}>
          <RippleButton
            type="submit"
            aria-label="Reîmprospătează"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-hir-border bg-hir-surface px-3 py-2 text-xs font-medium text-hir-fg transition-all hover:border-violet-500/40 hover:bg-hir-border active:scale-95 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
            rippleColor="bg-violet-400/30"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Actualizează
          </RippleButton>
        </form>
      </div>

      <Section title="Comenzile mele" count={assigned.length}>
        {assigned.length === 0 ? (
          <EmptyState
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
          <StaggerList className="flex flex-col gap-3" ariaLabel="Comenzile mele">
            {assigned.map((o, idx) => (
              <OrderListItem
                key={o.id}
                order={o}
                seqNumber={idx + 1}
                tenantName={isModeB ? tenantNameById.get(o.source_tenant_id ?? '') ?? null : null}
              />
            ))}
          </StaggerList>
        )}
      </Section>

      {showOpenOrders ? (
        <Section title="Comenzi disponibile" count={open.length}>
          {open.length === 0 ? (
            <EmptyState
              icon={<MapPinned className="h-5 w-5" aria-hidden />}
              title="Nicio comandă liberă în zonă"
              hint="Verifică din nou peste câteva minute sau privește harta din pagina principală."
              ctaHref="/dashboard"
              ctaLabel="Deschide harta"
            />
          ) : (
            <StaggerList className="flex flex-col gap-3" ariaLabel="Comenzi disponibile">
              {open.map((o) => (
                <OrderListItem
                  key={o.id}
                  order={o}
                  tenantName={isModeB ? tenantNameById.get(o.source_tenant_id ?? '') ?? null : null}
                />
              ))}
            </StaggerList>
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
      <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
        {title}
        {count > 0 ? (
          <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-violet-200 ring-1 ring-inset ring-violet-500/30">
            {count}
          </span>
        ) : null}
      </h2>
      {children}
    </section>
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

  const fee = order.delivery_fee_ron != null ? Number(order.delivery_fee_ron) : null;

  return (
    <Link
      href={`/dashboard/orders/${order.id}`}
      className="group block rounded-2xl border border-hir-border bg-hir-surface p-4 transition-all hover:-translate-y-px hover:border-violet-500/50 hover:bg-hir-border/40 hover:shadow-lg hover:shadow-violet-500/10 active:translate-y-0 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
    >
      {/* Header row: sequence + customer + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {seqNumber != null ? (
            <span
              aria-label={`Comanda ${seqNumber}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500 text-xs font-bold text-white shadow-md shadow-violet-500/30"
            >
              {seqNumber}
            </span>
          ) : null}
          <p className="truncate text-base font-semibold text-hir-fg">
            {order.customer_first_name ?? 'Client'}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      {/* Badges row: vertical + tenant */}
      {(order.vertical === 'pharma' || tenantName) ? (
        <div className="mt-2 flex items-center gap-1.5">
          <VerticalBadge vertical={order.vertical ?? 'restaurant'} />
          <TenantBadge name={tenantName ?? null} />
        </div>
      ) : null}

      {/* Route — pickup → dropoff stacked, with dots + connector for clarity */}
      <div className="relative mt-3 flex flex-col gap-1.5 text-xs">
        <span
          aria-hidden
          className="absolute left-[3px] top-3 h-3 w-0.5 bg-gradient-to-b from-violet-400/50 to-emerald-400/50"
        />
        <div className="relative flex items-start gap-2">
          <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full bg-violet-400 ring-2 ring-hir-surface" />
          <span className="truncate text-hir-muted-fg">{order.pickup_line1 ?? '—'}</span>
        </div>
        <div className="relative flex items-start gap-2">
          <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-400 ring-2 ring-hir-surface" />
          <span className="truncate text-hir-muted-fg">{order.dropoff_line1 ?? '—'}</span>
        </div>
      </div>

      {/* Footer row: distance/ETA chip + fee callout */}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-hir-border/60 pt-3">
        <div className="flex items-center gap-2 text-[11px] text-hir-muted-fg">
          {distanceKm != null ? (
            <span className="flex items-center gap-1 rounded-lg bg-hir-border/60 px-2 py-1 font-medium text-hir-fg">
              <Navigation className="h-3 w-3 text-violet-300" aria-hidden />
              {distanceKm.toFixed(1)} km
            </span>
          ) : null}
          {etaMin != null ? <span>~{etaMin} min</span> : null}
          <span className="text-hir-muted-fg/70">·</span>
          <span>{formatAge(order.created_at)}</span>
        </div>
        {fee != null ? (
          <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-sm font-bold tabular-nums text-emerald-300">
            +{fee.toFixed(2)} RON
          </span>
        ) : null}
      </div>
    </Link>
  );
}
