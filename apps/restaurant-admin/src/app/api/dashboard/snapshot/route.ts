import { NextResponse } from 'next/server';
import { getActiveTenant, assertTenantMember } from '@/lib/tenant';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Tenant-scoped operational snapshot for the admin home widget. Returns
// today's order count + revenue, last-7d totals + average ticket, and
// top items from the last 30 days. All counts come from a single tenant's
// orders so the response is small (< 5 KB typical) and the queries are
// indexed on (tenant_id, created_at).
//
// Money amounts are returned as plain numbers (RON) — admin UI formats.
// Revenue is computed only over orders that are NOT in PENDING/CANCELLED
// state so the figure tracks what the restaurant actually earned.

type ItemEntry = {
  name?: string;
  item_name?: string;
  quantity?: number;
  qty?: number;
};

type OrderRow = {
  id: string;
  total_ron: string | number | null;
  status: string;
  items: unknown;
};

const REVENUE_STATUSES = new Set(['CONFIRMED', 'PREPARING', 'READY', 'DISPATCHED', 'IN_DELIVERY', 'DELIVERED']);

function startOfDayUtc(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function summariseTopItems(orders: OrderRow[], limit: number): { name: string; qty: number }[] {
  const counts = new Map<string, number>();
  for (const o of orders) {
    if (!Array.isArray(o.items)) continue;
    for (const it of o.items as ItemEntry[]) {
      const name = (it.name ?? it.item_name ?? '').toString().trim();
      if (!name) continue;
      const qty = Number(it.qty ?? it.quantity ?? 1);
      counts.set(name, (counts.get(name) ?? 0) + (Number.isFinite(qty) ? qty : 1));
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, qty]) => ({ name, qty }));
}

export async function GET() {
  const { user, tenant } = await getActiveTenant().catch(() => ({ user: null, tenant: null }));
  if (!user || !tenant) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  // assertTenantMember throws if the user isn't a member -> would surface as a
  // 500 from Next runtime. Catch and return 403 explicitly so the caller gets
  // a clean status code.
  try {
    await assertTenantMember(user.id, tenant.id);
  } catch {
    return NextResponse.json({ error: 'forbidden_not_member' }, { status: 403 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const todayStart = startOfDayUtc(now);
  const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const month = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const COLS = 'id, total_ron, status, items, created_at';
  const { data: rowsRaw, error } = await admin
    .from('restaurant_orders')
    .select(COLS)
    .eq('tenant_id', tenant.id)
    .gte('created_at', month.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[dashboard/snapshot] db_error', error.message);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (rowsRaw ?? []) as any[];

  let ordersToday = 0;
  let revenueToday = 0;
  let ordersWeek = 0;
  let revenueWeek = 0;
  for (const r of rows) {
    const created = new Date(r.created_at);
    const counts = REVENUE_STATUSES.has(r.status);
    const total = Number(r.total_ron ?? 0);
    if (created >= todayStart) {
      ordersToday += 1;
      if (counts) revenueToday += total;
    }
    if (created >= week) {
      ordersWeek += 1;
      if (counts) revenueWeek += total;
    }
  }

  const topItems = summariseTopItems(rows as OrderRow[], 5);

  return NextResponse.json({
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    today: {
      ordersCount: ordersToday,
      revenueRon: Math.round(revenueToday * 100) / 100,
    },
    last7d: {
      ordersCount: ordersWeek,
      revenueRon: Math.round(revenueWeek * 100) / 100,
      avgTicketRon: ordersWeek > 0 ? Math.round((revenueWeek / ordersWeek) * 100) / 100 : 0,
    },
    topItems30d: topItems,
    generatedAt: now.toISOString(),
  });
}
