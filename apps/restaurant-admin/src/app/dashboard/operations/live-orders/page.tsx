import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import { friendlyDbError } from '@/lib/db-error';
import { LiveOrdersClient } from './_components/live-orders-client';

export const dynamic = 'force-dynamic';

// All active + terminal statuses we care about for today's view.
const ALL_STATUSES = [
  'CREATED',
  'OFFERED',
  'ACCEPTED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED',
] as const;

export type CourierOrderStatus = (typeof ALL_STATUSES)[number];

export type LiveOrder = {
  id: string;
  status: CourierOrderStatus;
  customer_first_name: string | null;
  customer_phone: string | null;
  dropoff_line1: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  pickup_line1: string | null;
  items: unknown;
  total_ron: number | null;
  delivery_fee_ron: number | null;
  payment_method: 'CARD' | 'COD' | null;
  assigned_courier_user_id: string | null;
  created_at: string;
  updated_at: string;
  // joined from courier_profiles via assigned_courier_user_id
  courier_name: string | null;
  courier_phone: string | null;
};

export type DaySummary = {
  total: number;
  active: number;
  delivered: number;
  cancelled: number;
  // avg delivery minutes (DELIVERED only, created→updated proxy)
  avg_delivery_min: number | null;
};

export type ZoneDistribution = {
  zone: string;
  count: number;
};

function startOfDayIso(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfDayIso(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

// Derive zone label from dropoff_line1 (best-effort street prefix grouping).
// The real zone-level data lives in delivery_zones polygons; without a
// PostGIS point-in-polygon query here we approximate by taking the first
// token of the address (e.g. "Cibinului 9" → "Cibinului"). For the pie
// chart this gives useful signal while keeping the query simple.
function deriveZoneLabel(address: string | null): string {
  if (!address) return 'Necunoscut';
  const token = address.trim().split(/[\s,]+/)[0] ?? 'Necunoscut';
  return token.length > 1 ? token : 'Necunoscut';
}

export default async function LiveOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const range = sp?.range === 'yesterday' ? 'yesterday'
    : sp?.range === 'week' ? 'week'
    : 'today';

  const { tenant } = await getActiveTenant();
  const admin = createAdminClient();

  // Date range bounds.
  const fromIso =
    range === 'yesterday' ? startOfDayIso(1)
    : range === 'week' ? startOfDayIso(6)
    : startOfDayIso(0);
  const toIso =
    range === 'yesterday' ? endOfDayIso(1)
    : endOfDayIso(0);

  const COLS =
    'id, status, customer_first_name, customer_phone, dropoff_line1, dropoff_lat, dropoff_lng, pickup_line1, items, total_ron, delivery_fee_ron, payment_method, assigned_courier_user_id, created_at, updated_at';

  const { data: ordersData, error: ordersError } = await admin
    .from('courier_orders')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select(COLS as any)
    .eq('source_tenant_id', tenant.id)
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false })
    .limit(200);

  if (ordersError) throw friendlyDbError(ordersError, 'Live Orders');

  const rawOrders = (ordersData ?? []) as Array<{
    id: string;
    status: string;
    customer_first_name: string | null;
    customer_phone: string | null;
    dropoff_line1: string | null;
    dropoff_lat: number | null;
    dropoff_lng: number | null;
    pickup_line1: string | null;
    items: unknown;
    total_ron: number | null;
    delivery_fee_ron: number | null;
    payment_method: 'CARD' | 'COD' | null;
    assigned_courier_user_id: string | null;
    created_at: string;
    updated_at: string;
  }>;

  // Fetch courier profiles for all assigned couriers in one query.
  const courierIds = [
    ...new Set(
      rawOrders
        .map((o) => o.assigned_courier_user_id)
        .filter((id): id is string => id !== null),
    ),
  ];

  let courierMap: Map<string, { full_name: string | null; phone: string | null }> =
    new Map();

  if (courierIds.length > 0) {
    const { data: profilesData } = await admin
      .from('courier_profiles')
      .select('user_id, full_name, phone')
      .in('user_id', courierIds);

    for (const p of profilesData ?? []) {
      const row = p as { user_id: string; full_name: string | null; phone: string | null };
      courierMap.set(row.user_id, { full_name: row.full_name, phone: row.phone });
    }
  }

  const orders: LiveOrder[] = rawOrders.map((o) => {
    const profile = o.assigned_courier_user_id
      ? courierMap.get(o.assigned_courier_user_id)
      : undefined;
    return {
      ...o,
      status: (ALL_STATUSES.includes(o.status as CourierOrderStatus)
        ? o.status
        : 'CREATED') as CourierOrderStatus,
      courier_name: profile?.full_name ?? null,
      courier_phone: profile?.phone ?? null,
    };
  });

  // Build summary.
  const ACTIVE_SET = new Set(['CREATED', 'OFFERED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']);
  const delivered = orders.filter((o) => o.status === 'DELIVERED');
  const cancelled = orders.filter((o) => o.status === 'CANCELLED');
  const active = orders.filter((o) => ACTIVE_SET.has(o.status));

  // Average delivery time: for DELIVERED orders, proxy = updated_at - created_at.
  let avg_delivery_min: number | null = null;
  if (delivered.length > 0) {
    const totalMs = delivered.reduce((sum, o) => {
      return sum + (new Date(o.updated_at).getTime() - new Date(o.created_at).getTime());
    }, 0);
    avg_delivery_min = Math.round(totalMs / delivered.length / 60_000);
  }

  const summary: DaySummary = {
    total: orders.length,
    active: active.length,
    delivered: delivered.length,
    cancelled: cancelled.length,
    avg_delivery_min,
  };

  // Zone distribution (first word of dropoff_line1 as zone label).
  const zoneCountMap = new Map<string, number>();
  for (const o of orders) {
    const label = deriveZoneLabel(o.dropoff_line1);
    zoneCountMap.set(label, (zoneCountMap.get(label) ?? 0) + 1);
  }
  const zoneDistribution: ZoneDistribution[] = Array.from(zoneCountMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([zone, count]) => ({ zone, count }));

  // Yesterday summary for comparison.
  let yesterdaySummary: DaySummary | null = null;
  if (range === 'today') {
    const { data: yData } = await admin
      .from('courier_orders')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select('status, created_at, updated_at' as any)
      .eq('source_tenant_id', tenant.id)
      .gte('created_at', startOfDayIso(1))
      .lte('created_at', endOfDayIso(1))
      .limit(200);

    if (yData) {
      const yOrders = yData as Array<{ status: string; created_at: string; updated_at: string }>;
      const yDelivered = yOrders.filter((o) => o.status === 'DELIVERED');
      const yAvgMs =
        yDelivered.length > 0
          ? yDelivered.reduce(
              (s, o) =>
                s + (new Date(o.updated_at).getTime() - new Date(o.created_at).getTime()),
              0,
            ) / yDelivered.length
          : 0;
      yesterdaySummary = {
        total: yOrders.length,
        active: yOrders.filter((o) => ACTIVE_SET.has(o.status)).length,
        delivered: yDelivered.length,
        cancelled: yOrders.filter((o) => o.status === 'CANCELLED').length,
        avg_delivery_min: yDelivered.length > 0 ? Math.round(yAvgMs / 60_000) : null,
      };
    }
  }

  return (
    <LiveOrdersClient
      tenantId={tenant.id}
      tenantName={tenant.name}
      orders={orders}
      summary={summary}
      yesterdaySummary={yesterdaySummary}
      zoneDistribution={zoneDistribution}
      range={range}
    />
  );
}
