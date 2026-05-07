import Link from 'next/link';
import { AlertTriangle, Receipt, ShieldCheck, ShoppingCart, Star, TrendingDown, TrendingUp } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildSparklineSeries } from '@/lib/uiux-quickwins';

// Server component. Pulls 4 KPIs for "today" + a delta vs yesterday so the
// owner can see a glanceable health line at the top of the dashboard.
// Single round-trip via parallel selects — no separate views, no schema work.
//
// QW2 (UIUX audit 2026-05-08): per-card 7-day sparkline, rendered inline as
// a tiny SVG (no recharts dependency on the home critical path). Source =
// `v_orders_daily` already used by /analytics; we filter to last 7 days
// client-side off the same row set.
//
// QW9 (UIUX audit 2026-05-08): low-stock pill — count of inventory items
// at/under their reorder threshold. Rendered only when inventory is
// premium-enabled AND there's at least one tracked item; otherwise the
// inline-sized pill stays hidden so non-premium tenants see no upsell here.

type DailyRow = { day: string; revenue: number; orders: number };

type Stats = {
  todaySalesRon: number;
  todayOrders: number;
  yesterdaySalesRon: number;
  yesterdayOrders: number;
  reviewsLast7d: number;
  // QW2 — 7-day series. Each entry is a single calendar day; missing days
  // (no orders) get filled in as 0 by buildSparklineSeries() so the
  // sparkline length is always exactly 7 points.
  salesSeries7d: number[];
  ordersSeries7d: number[];
  // QW9 — low-stock count. Null when inventory feature is off for this
  // tenant (renders nothing); 0+ otherwise.
  lowStockCount: number | null;
};


async function loadStats(tenantId: string): Promise<Stats> {
  const admin = createAdminClient();

  const now = new Date();
  // Romania local-day boundary (UTC+2/+3) is approximated by anchoring on
  // Europe/Bucharest 00:00; Postgres handles the offset via timestamptz.
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const yesterdayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
  ).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const nowMs = now.getTime();

  // v_orders_daily is RLS-scoped via security_invoker but we additionally
  // filter by tenant_id to enforce single-tenant scope. Cast through
  // unknown because the views aren't in the generated supabase types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dailyP = (admin as any)
    .from('v_orders_daily')
    .select('day, revenue, order_count')
    .eq('tenant_id', tenantId)
    .gte('day', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));

  // QW9 — low-stock probe. inventory_items is gated by feature_flags; we
  // skip the query unless the flag is set so non-premium tenants don't
  // make extra DB round-trips on every dashboard render.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flagsP = (admin.from('tenants') as any)
    .select('feature_flags')
    .eq('id', tenantId)
    .maybeSingle();

  const [todayQ, yesterdayQ, reviewsQ, dailyQ, flagsQ] = await Promise.all([
    admin
      .from('restaurant_orders')
      .select('total_ron, status, created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', todayStart)
      .neq('status', 'CANCELLED'),
    admin
      .from('restaurant_orders')
      .select('total_ron, status, created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart)
      .neq('status', 'CANCELLED'),
    admin
      .from('restaurant_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', weekStart),
    dailyP,
    flagsP,
  ]);

  const sumRon = (rows: Array<{ total_ron: number | string | null }> | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.total_ron ?? 0), 0);

  const dailyRows = (
    (dailyQ as { data: Array<{ day: string; revenue: number | string; order_count: number | string }> | null }).data ?? []
  ).map((r) => ({
    day: r.day,
    revenue: Number(r.revenue ?? 0),
    orders: Number(r.order_count ?? 0),
  })) as DailyRow[];

  const flags = ((flagsQ as { data: { feature_flags?: Record<string, unknown> } | null }).data
    ?.feature_flags ?? {}) as Record<string, unknown>;
  const inventoryEnabled =
    flags.inventory_enabled === true || flags.inventory_enabled === 'true';

  let lowStockCount: number | null = null;
  if (inventoryEnabled) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lowQ = await (admin as any)
      .from('inventory_items')
      .select('current_stock, reorder_threshold')
      .eq('tenant_id', tenantId)
      .gt('reorder_threshold', 0);
    if (!lowQ.error) {
      const rows = (lowQ.data ?? []) as Array<{
        current_stock: number | string | null;
        reorder_threshold: number | string | null;
      }>;
      lowStockCount = rows.filter(
        (r) => Number(r.current_stock ?? 0) <= Number(r.reorder_threshold ?? 0),
      ).length;
    } else {
      // Pre-migration tenants: treat as no inventory rather than crashing.
      lowStockCount = null;
    }
  }

  return {
    todaySalesRon: sumRon(todayQ.data),
    todayOrders: (todayQ.data ?? []).length,
    yesterdaySalesRon: sumRon(yesterdayQ.data),
    yesterdayOrders: (yesterdayQ.data ?? []).length,
    reviewsLast7d: reviewsQ.count ?? 0,
    salesSeries7d: buildSparklineSeries(
      dailyRows.map((r) => ({ day: r.day, value: r.revenue })),
      nowMs,
    ),
    ordersSeries7d: buildSparklineSeries(
      dailyRows.map((r) => ({ day: r.day, value: r.orders })),
      nowMs,
    ),
    lowStockCount,
  };
}

function formatRon(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} RON`;
}

function pctDelta(now: number, prev: number): number | null {
  if (prev === 0) return now > 0 ? 100 : null;
  return ((now - prev) / prev) * 100;
}

function DeltaChip({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-[11px] font-medium text-zinc-400">vs ieri</span>;
  }
  const positive = value >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        positive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
      }`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {positive ? '+' : ''}
      {value.toFixed(0)}%
    </span>
  );
}

/**
 * Tiny inline sparkline. 7 points → 100x24 viewBox. Returns null when the
 * series is all zeros (no data; render nothing rather than a flat line at
 * the bottom of the card). Color matches delta direction so the chart
 * matches the chip emotion. Polyline only — no axes, no labels (this is a
 * glanceable trend cue, not a chart).
 *
 * QW2 success criterion: "Each KPI card shows a thin colored sparkline
 * below the number. Sparkline color matches the delta."
 */
function Sparkline({ values, positive }: { values: number[]; positive: boolean | null }) {
  if (values.length === 0) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min;
  if (max === 0) return null; // all-zero series — skip render
  const W = 100;
  const H = 24;
  const PADX = 1;
  const PADY = 2;
  const usableW = W - 2 * PADX;
  const usableH = H - 2 * PADY;
  const points = values
    .map((v, i) => {
      const x = PADX + (i / Math.max(1, values.length - 1)) * usableW;
      // Flat-line guard: when all values equal (range=0) draw a centered line.
      const norm = range === 0 ? 0.5 : (v - min) / range;
      const y = H - PADY - norm * usableH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  // null → emerald (neutral positive default for a brand-new tenant with
  // zero-vs-zero today). Matches DeltaChip's "vs ieri" empty case.
  const stroke = positive === false ? '#f43f5e' : '#10b981';
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-2 h-6 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Tendință 7 zile"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Card({
  label,
  value,
  delta,
  icon,
  sparkline,
}: {
  label: string;
  value: string;
  delta?: React.ReactNode;
  icon: React.ReactNode;
  sparkline?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
        <span className="text-zinc-300">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900">{value}</p>
      {delta ? <div className="mt-1">{delta}</div> : null}
      {sparkline}
    </div>
  );
}

export async function KpiCards({ tenantId }: { tenantId: string }) {
  const s = await loadStats(tenantId);
  const salesDelta = pctDelta(s.todaySalesRon, s.yesterdaySalesRon);
  const ordersDelta = pctDelta(s.todayOrders, s.yesterdayOrders);
  const avgTicket = s.todayOrders > 0 ? s.todaySalesRon / s.todayOrders : 0;
  const salesPositive = salesDelta === null ? null : salesDelta >= 0;
  const ordersPositive = ordersDelta === null ? null : ordersDelta >= 0;

  // Positioning ribbon: HIR doesn't take a per-order cut. Frame today's
  // sales as money the tenant kept vs. a ~30% aggregator — matches Glovo's
  // standard merchant rate for new RO clients in 2026 (Wolt RO sits at the
  // 25–30% range; legacy Glovo contracts were 25%).
  // Hidden when there are zero sales today — nothing to celebrate yet.
  const aggregatorWouldTake = s.todaySalesRon * 0.3;

  return (
    <section aria-label="Statistici azi" className="flex flex-col gap-3">
      {s.todaySalesRon > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <ShieldCheck className="h-4 w-4 flex-none text-emerald-600" aria-hidden />
          <p>
            <span className="font-semibold">Comision platformă: 0 RON.</span>{' '}
            Pe un agregator cu ~30% comision azi ai fi plătit ~
            <span className="font-mono tabular-nums">{formatRon(aggregatorWouldTake)}</span>.
          </p>
        </div>
      )}
      {/* QW9 — low-stock pill. Rendered above the KPI grid as a single
          banner-pill so it's actionable without re-flowing the card grid
          (which is already 4-up on desktop). Click filters the inventory
          page to low-stock rows. */}
      {s.lowStockCount !== null && s.lowStockCount > 0 && (
        <Link
          href="/dashboard/inventory?filter=low"
          className="inline-flex items-center gap-2 self-start rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100"
        >
          <AlertTriangle className="h-3.5 w-3.5 flex-none text-amber-600" aria-hidden />
          {s.lowStockCount}{' '}
          {s.lowStockCount === 1 ? 'produs pe terminate' : 'produse pe terminate'} →
        </Link>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card
        label="Vânzări azi"
        value={formatRon(s.todaySalesRon)}
        delta={<DeltaChip value={salesDelta} />}
        icon={<TrendingUp className="h-4 w-4" />}
        sparkline={<Sparkline values={s.salesSeries7d} positive={salesPositive} />}
      />
      <Card
        label="Comenzi azi"
        value={String(s.todayOrders)}
        delta={<DeltaChip value={ordersDelta} />}
        icon={<Receipt className="h-4 w-4" />}
        sparkline={<Sparkline values={s.ordersSeries7d} positive={ordersPositive} />}
      />
      <Card
        label="Coș mediu"
        value={s.todayOrders > 0 ? formatRon(avgTicket) : '—'}
        icon={<ShoppingCart className="h-4 w-4" />}
      />
      <Link
        href="/dashboard/reviews"
        className="rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:bg-zinc-50"
      >
        <div className="flex items-start justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Recenzii (7z)
          </p>
          <Star className="h-4 w-4 text-zinc-300" />
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900">{s.reviewsLast7d}</p>
        <p className="mt-1 text-[11px] font-medium text-purple-700 hover:text-purple-900">
          Vezi recenziile →
        </p>
      </Link>
      </div>
    </section>
  );
}
