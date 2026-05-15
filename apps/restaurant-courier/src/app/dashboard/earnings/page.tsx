import Link from 'next/link';
import { Wallet } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { StreakCard } from './_streak-card';
import { ProjectionCard } from './_projection-card';
import { BestDayCard } from './_best-day-card';

export const dynamic = 'force-dynamic';

type DeliveredRow = {
  id: string;
  delivery_fee_ron: number | null;
  updated_at: string;
  customer_first_name: string | null;
  dropoff_line1: string | null;
};

/**
 * Real earnings page: today / this week (Mon-Sun) / this month, plus the
 * last 5 delivered orders. Reuses the same query pattern as <EarningsBar />
 * with broader time bounds. All times are interpreted in server-local
 * timezone (TZ=Europe/Bucharest in Vercel env); good enough for MVP.
 *
 * Notes:
 *   - "Earnings" today equals the sum of `delivery_fee_ron` on DELIVERED
 *     orders assigned to this courier. This is the courier's gross fee, not
 *     net of any HIR commission, because the commission policy is not yet
 *     persisted per-courier. When a per-courier rate model lands, swap the
 *     `sum` here for an aggregation against `courier_payout_lines` (TBD).
 *   - The screen is read-only. No payout-request CTA yet — that requires a
 *     payout schedule decision and a finance integration; out of scope for
 *     pilot.
 */
export default async function EarningsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  // Time bounds — all in server-local time. Vercel default TZ on EU
  // deployments is UTC; setting TZ=Europe/Bucharest in env produces
  // courier-friendly day boundaries.
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(startOfToday);
  // Romanian week: Monday = day 1; Sunday = day 0. Shift Sunday back 6.
  const dow = startOfWeek.getDay();
  const offset = dow === 0 ? 6 : dow - 1;
  startOfWeek.setDate(startOfWeek.getDate() - offset);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Trailing-30-day window for streak computation.
  const start30d = new Date(startOfToday);
  start30d.setDate(start30d.getDate() - 30);

  // Trailing-7-day window for projection (excludes today).
  const start7d = new Date(startOfToday);
  start7d.setDate(start7d.getDate() - 7);

  // Fetch this-month data (for StatCards + BestDay) and last-30d data
  // (for Streak + Projection) in parallel. The two windows may partially
  // overlap but keeping them separate avoids merging logic for the wider
  // streak window when the month boundary falls inside the 30d range.
  const [{ data: monthRows }, { data: trailing30Rows }] = await Promise.all([
    admin
      .from('courier_orders')
      .select('id, delivery_fee_ron, updated_at, customer_first_name, dropoff_line1')
      .eq('assigned_courier_user_id', user.id)
      .eq('status', 'DELIVERED')
      .gte('updated_at', startOfMonth.toISOString())
      .order('updated_at', { ascending: false }),
    admin
      .from('courier_orders')
      .select('delivery_fee_ron, updated_at')
      .eq('assigned_courier_user_id', user.id)
      .eq('status', 'DELIVERED')
      .gte('updated_at', start30d.toISOString())
      .order('updated_at', { ascending: false }),
  ]);

  const all = (monthRows ?? []) as DeliveredRow[];
  const last30 = (trailing30Rows ?? []) as Array<{ delivery_fee_ron: number | null; updated_at: string }>;

  const sumFor = (since: Date) => {
    let count = 0;
    let earnings = 0;
    for (const r of all) {
      if (new Date(r.updated_at) >= since) {
        count += 1;
        earnings += Number(r.delivery_fee_ron) || 0;
      }
    }
    return { count, earnings };
  };

  const today = sumFor(startOfToday);
  const week = sumFor(startOfWeek);
  const month = sumFor(startOfMonth);

  const recent = all.slice(0, 5);

  // Best day of the current month — bucket by YYYY-MM-DD so a single
  // 23:55 → 00:05 spillover doesn't double-count.
  const byDay = new Map<string, { earnings: number; count: number }>();
  for (const row of all) {
    const d = new Date(row.updated_at);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const key = `${d.getFullYear()}-${mm}-${dd}`;
    const acc = byDay.get(key) ?? { earnings: 0, count: 0 };
    acc.earnings += Number(row.delivery_fee_ron) || 0;
    acc.count += 1;
    byDay.set(key, acc);
  }

  let bestDayKey: string | null = null;
  let bestDayEarnings = 0;
  for (const [k, v] of byDay) {
    if (v.earnings > bestDayEarnings) {
      bestDayKey = k;
      bestDayEarnings = v.earnings;
    }
  }
  const bestDayData = bestDayKey
    ? {
        key: bestDayKey,
        earnings: bestDayEarnings,
        count: byDay.get(bestDayKey)?.count ?? 0,
      }
    : null;

  // Split trailing-30d rows into today vs the previous 7 days for
  // ProjectionCard. Rows from before start7d are not needed there.
  const todayRows = last30.filter((r) => new Date(r.updated_at) >= startOfToday);
  const trailing7Rows = last30.filter(
    (r) => new Date(r.updated_at) >= start7d && new Date(r.updated_at) < startOfToday,
  );

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
          <Wallet className="h-5 w-5 text-violet-400" aria-hidden />
          Câștigurile tale
        </h1>
        <p className="mt-1 text-xs text-zinc-500">
          Suma încasată din taxe de livrare, calculată din comenzile marcate ca livrate.
        </p>
      </div>

      <section className="grid grid-cols-3 gap-2 min-[360px]:gap-3">
        <StatCard label="Astăzi" earnings={today.earnings} count={today.count} accent="violet" />
        <StatCard label="Săptămâna" earnings={week.earnings} count={week.count} accent="zinc" />
        <StatCard label="Luna" earnings={month.earnings} count={month.count} accent="zinc" />
      </section>

      {/* Audit P1 #8 — earnings transparency. Formula is exposed even when
          commission is 0 today, so the courier trusts the number rather than
          wondering what's deducted. When per-courier commission lands later,
          the row populates without UI changes. */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          Cum calculăm câștigul de azi
        </p>
        <div className="space-y-1.5 text-sm tabular-nums">
          <div className="flex items-center justify-between text-hir-fg">
            <span>Brut (taxe livrare)</span>
            <span className="font-medium text-zinc-100">
              {today.earnings.toFixed(2)} RON
            </span>
          </div>
          <div className="flex items-center justify-between text-zinc-500">
            <span>− Comision HIR</span>
            <span className="font-medium">0,00 RON</span>
          </div>
          <div className="flex items-center justify-between border-t border-zinc-800 pt-1.5 text-zinc-100">
            <span className="font-semibold">= Net</span>
            <span className="font-semibold text-emerald-300">
              {today.earnings.toFixed(2)} RON
            </span>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">
          Astăzi tot brutul e net. Pe viitor un mic comision platformă va fi
          dedus aici, mereu vizibil înainte de plată.
        </p>
      </section>

      {/* Gamification cards — stacked above recent deliveries list. */}
      <StreakCard rows={last30} />
      <ProjectionCard todayRows={todayRows} trailing7Rows={trailing7Rows} />
      <BestDayCard bestDay={bestDayData} />

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Ultimele livrări
        </h2>
        {recent.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-8 text-center">
            <p className="text-sm font-medium text-hir-fg">
              Nu ai livrări înregistrate luna aceasta
            </p>
            <p className="text-xs text-zinc-500">
              Câștigurile apar aici imediat ce marchezi prima livrare.
            </p>
            <Link
              href="/dashboard"
              className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-200 hover:border-violet-400 hover:bg-violet-500/15"
            >
              Pornește o tură
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/dashboard/orders/${r.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-hir-border bg-hir-surface p-4 hover:border-violet-500/40 active:scale-[0.99]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-100">
                      {r.customer_first_name ?? 'Client'}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {r.dropoff_line1 ?? '—'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-emerald-300">
                      +{(Number(r.delivery_fee_ron) || 0).toFixed(2)} RON
                    </p>
                    <p className="mt-0.5 text-[10px] text-zinc-500">
                      {new Date(r.updated_at).toLocaleString('ro-RO', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-[11px] text-hir-muted-fg">
        Plata se face prin contul dumneavoastră HIR. Pentru întrebări, contactați suportul.
      </p>
    </div>
  );
}

function StatCard({
  label,
  earnings,
  count,
  accent,
}: {
  label: string;
  earnings: number;
  count: number;
  accent: 'violet' | 'zinc';
}) {
  const border = accent === 'violet' ? 'border-violet-500/40' : 'border-zinc-800';
  const earningsColor = accent === 'violet' ? 'text-violet-300' : 'text-zinc-100';
  return (
    <div className={`rounded-2xl border ${border} bg-zinc-900 p-3 text-center`}>
      <p className="truncate text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1.5 text-sm font-bold leading-none ${earningsColor} min-[400px]:text-base`}>
        {earnings.toFixed(2)}
      </p>
      <p className="mt-0.5 text-[10px] font-normal text-zinc-500">RON</p>
      <p className="mt-1 text-[10px] text-zinc-600">
        {count} {count === 1 ? 'liv.' : 'liv.'}
      </p>
    </div>
  );
}
