import Link from 'next/link';
import { Receipt, ShieldCheck, ShoppingCart, Star, TrendingDown, TrendingUp } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';

// Server component. Pulls 4 KPIs for "today" + a delta vs yesterday so the
// owner can see a glanceable health line at the top of the dashboard.
// Single round-trip via parallel selects — no separate views, no schema work.

type Stats = {
  todaySalesRon: number;
  todayOrders: number;
  yesterdaySalesRon: number;
  yesterdayOrders: number;
  reviewsLast7d: number;
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

  const [todayQ, yesterdayQ, reviewsQ] = await Promise.all([
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
  ]);

  const sumRon = (rows: Array<{ total_ron: number | string | null }> | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.total_ron ?? 0), 0);

  return {
    todaySalesRon: sumRon(todayQ.data),
    todayOrders: (todayQ.data ?? []).length,
    yesterdaySalesRon: sumRon(yesterdayQ.data),
    yesterdayOrders: (yesterdayQ.data ?? []).length,
    reviewsLast7d: reviewsQ.count ?? 0,
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

function Card({
  label,
  value,
  delta,
  icon,
}: {
  label: string;
  value: string;
  delta?: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
        <span className="text-zinc-300">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900">{value}</p>
      {delta ? <div className="mt-1">{delta}</div> : null}
    </div>
  );
}

export async function KpiCards({ tenantId }: { tenantId: string }) {
  const s = await loadStats(tenantId);
  const salesDelta = pctDelta(s.todaySalesRon, s.yesterdaySalesRon);
  const ordersDelta = pctDelta(s.todayOrders, s.yesterdayOrders);
  const avgTicket = s.todayOrders > 0 ? s.todaySalesRon / s.todayOrders : 0;

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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card
        label="Vânzări azi"
        value={formatRon(s.todaySalesRon)}
        delta={<DeltaChip value={salesDelta} />}
        icon={<TrendingUp className="h-4 w-4" />}
      />
      <Card
        label="Comenzi azi"
        value={String(s.todayOrders)}
        delta={<DeltaChip value={ordersDelta} />}
        icon={<Receipt className="h-4 w-4" />}
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
