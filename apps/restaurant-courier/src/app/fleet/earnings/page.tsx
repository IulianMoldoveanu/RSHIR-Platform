import { Banknote, Calendar, Download, TrendingUp } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFleetManager } from '@/lib/fleet-manager';
import { resolveTenantNames } from '@/lib/tenant-names';

export const dynamic = 'force-dynamic';

type DeliveredRow = {
  delivery_fee_ron: number | null;
  total_ron: number | null;
  payment_method: 'CARD' | 'COD' | null;
  assigned_courier_user_id: string | null;
  source_tenant_id: string | null;
  updated_at: string;
};

type CourierRow = {
  user_id: string;
  full_name: string | null;
};

function startOfDay(offset = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function FleetEarningsPage() {
  const fleet = await requireFleetManager();
  const admin = createAdminClient();

  const last7 = startOfDay(6);

  const [{ data: deliveredData }, { data: couriersData }] = await Promise.all([
    admin
      .from('courier_orders')
      .select(
        'delivery_fee_ron, total_ron, payment_method, assigned_courier_user_id, source_tenant_id, updated_at',
      )
      .eq('fleet_id', fleet.fleetId)
      .eq('status', 'DELIVERED')
      .gte('updated_at', last7.toISOString())
      .order('updated_at', { ascending: false })
      .limit(500),
    admin
      .from('courier_profiles')
      .select('user_id, full_name')
      .eq('fleet_id', fleet.fleetId),
  ]);

  const delivered = (deliveredData ?? []) as DeliveredRow[];
  const couriers = (couriersData ?? []) as CourierRow[];
  const courierName = new Map(couriers.map((c) => [c.user_id, c.full_name ?? '—']));

  // Aggregate today vs last 7 days.
  const today = startOfDay(0).getTime();
  let revenueToday = 0;
  let revenueWeek = 0;
  let cashToday = 0;
  let cashWeek = 0;
  const perCourier = new Map<string, { count: number; revenue: number; cash: number }>();
  // Per-tenant rollup parallel to perCourier — only surfaced when the
  // fleet handled >1 restaurant in the period. Single-restaurant fleets
  // skip the section entirely so the page stays focused.
  const perTenant = new Map<string, { count: number; revenue: number; cash: number }>();
  const dailyBuckets: Array<{ label: string; date: Date; count: number; revenue: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = startOfDay(i);
    dailyBuckets.push({
      label: d.toLocaleDateString('ro-RO', { weekday: 'short', day: '2-digit' }),
      date: d,
      count: 0,
      revenue: 0,
    });
  }

  for (const row of delivered) {
    const fee = Number(row.delivery_fee_ron) || 0;
    const ts = new Date(row.updated_at).getTime();
    const isToday = ts >= today;
    const isCash = row.payment_method === 'COD';
    revenueWeek += fee;
    if (isToday) revenueToday += fee;
    if (isCash) {
      const cashAmt = Number(row.total_ron) || 0;
      cashWeek += cashAmt;
      if (isToday) cashToday += cashAmt;
    }
    if (row.assigned_courier_user_id) {
      const cur = perCourier.get(row.assigned_courier_user_id) ?? {
        count: 0,
        revenue: 0,
        cash: 0,
      };
      cur.count += 1;
      cur.revenue += fee;
      if (isCash) cur.cash += Number(row.total_ron) || 0;
      perCourier.set(row.assigned_courier_user_id, cur);
    }
    if (row.source_tenant_id) {
      const cur = perTenant.get(row.source_tenant_id) ?? { count: 0, revenue: 0, cash: 0 };
      cur.count += 1;
      cur.revenue += fee;
      if (isCash) cur.cash += Number(row.total_ron) || 0;
      perTenant.set(row.source_tenant_id, cur);
    }
    // Slot into the right daily bucket — find bucket whose date <= ts < next bucket.
    for (let i = dailyBuckets.length - 1; i >= 0; i--) {
      if (ts >= dailyBuckets[i].date.getTime()) {
        dailyBuckets[i].count += 1;
        dailyBuckets[i].revenue += fee;
        break;
      }
    }
  }

  const sortedCouriers = [...perCourier.entries()]
    .map(([userId, stats]) => ({ userId, name: courierName.get(userId) ?? '—', ...stats }))
    .sort((a, b) => b.revenue - a.revenue);

  // Resolve restaurant names for the per-tenant breakdown. Cheap — at
  // most one row per distinct tenant the fleet served in 7 days.
  const tenantNames = await resolveTenantNames([...perTenant.keys()]);
  const sortedTenants = [...perTenant.entries()]
    .map(([id, stats]) => ({ id, name: tenantNames.get(id) ?? '—', ...stats }))
    .sort((a, b) => b.revenue - a.revenue);

  const maxDailyRevenue = Math.max(1, ...dailyBuckets.map((b) => b.revenue));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Decontări</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Sumar pentru ultimele 7 zile · {delivered.length} livrări totale.
          </p>
        </div>
        <a
          href="/fleet/earnings/export?days=30"
          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
          download
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          Export CSV (30 zile)
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          icon={<Banknote className="h-4 w-4 text-emerald-400" aria-hidden />}
          label="Încasări azi"
          value={`${revenueToday.toFixed(2)} RON`}
        />
        <Kpi
          icon={<TrendingUp className="h-4 w-4 text-violet-400" aria-hidden />}
          label="Încasări 7 zile"
          value={`${revenueWeek.toFixed(2)} RON`}
        />
        <Kpi
          icon={<Banknote className="h-4 w-4 text-amber-400" aria-hidden />}
          label="Cash azi"
          value={`${cashToday.toFixed(2)} RON`}
          hint="De colectat de la curieri"
        />
        <Kpi
          icon={<Calendar className="h-4 w-4 text-zinc-400" aria-hidden />}
          label="Cash 7 zile"
          value={`${cashWeek.toFixed(2)} RON`}
        />
      </div>

      {/* Tiny daily-revenue bar chart */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-100">Ultimele 7 zile</h2>
        <ul className="flex items-end gap-2">
          {dailyBuckets.map((b) => {
            const heightPct = (b.revenue / maxDailyRevenue) * 100;
            return (
              <li key={b.label} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-24 w-full items-end">
                  <div
                    className="w-full rounded-t-md bg-violet-500/40"
                    style={{ height: `${Math.max(heightPct, 4)}%` }}
                    aria-label={`${b.revenue.toFixed(2)} RON`}
                  />
                </div>
                <span className="text-[10px] text-zinc-500">{b.label}</span>
                <span className="text-[10px] font-medium text-zinc-300">
                  {b.revenue > 0 ? b.revenue.toFixed(0) : '—'}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Per-restaurant breakdown — only when the fleet handled orders
          from >1 restaurant in the last 7 days. Mirrors the per-courier
          layout below for consistency. */}
      {sortedTenants.length > 1 ? (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-100">
            Per restaurant ({sortedTenants.length})
          </h2>
          <ul className="divide-y divide-zinc-800">
            {sortedTenants.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span className="truncate text-sm text-zinc-100">{t.name}</span>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <span className="text-zinc-500">{t.count} livrări</span>
                  {t.cash > 0 ? (
                    <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                      Cash {t.cash.toFixed(2)}
                    </span>
                  ) : null}
                  <span className="font-semibold text-emerald-300">
                    {t.revenue.toFixed(2)} RON
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-100">
          Per curier ({sortedCouriers.length})
        </h2>
        {sortedCouriers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950 px-4 py-5 text-center text-xs text-zinc-500">
            Nicio livrare în ultimele 7 zile.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {sortedCouriers.map((c) => (
              <li
                key={c.userId}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span className="truncate text-sm text-zinc-100">{c.name}</span>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <span className="text-zinc-500">{c.count} livrări</span>
                  {c.cash > 0 ? (
                    <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                      Cash {c.cash.toFixed(2)}
                    </span>
                  ) : null}
                  <span className="font-semibold text-emerald-300">
                    {c.revenue.toFixed(2)} RON
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
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
