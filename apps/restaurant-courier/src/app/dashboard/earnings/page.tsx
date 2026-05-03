import Link from 'next/link';
import { Wallet } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
  const supabase = createServerClient();
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

  // One query covering the widest window (this month), bucket on the client.
  const { data: rows } = await admin
    .from('courier_orders')
    .select('id, delivery_fee_ron, updated_at, customer_first_name, dropoff_line1')
    .eq('assigned_courier_user_id', user.id)
    .eq('status', 'DELIVERED')
    .gte('updated_at', startOfMonth.toISOString())
    .order('updated_at', { ascending: false });

  const all = ((rows ?? []) as DeliveredRow[]);

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

      <section className="grid grid-cols-3 gap-2">
        <StatCard label="Astăzi" earnings={today.earnings} count={today.count} accent="violet" />
        <StatCard label="Săptămâna aceasta" earnings={week.earnings} count={week.count} accent="zinc" />
        <StatCard label="Luna aceasta" earnings={month.earnings} count={month.count} accent="zinc" />
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Ultimele livrări
        </h2>
        {recent.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-8 text-center text-sm text-zinc-500">
            Nu ai livrări înregistrate luna aceasta.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/dashboard/orders/${r.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3 hover:border-violet-500/40"
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

      <p className="text-center text-[11px] text-zinc-600">
        Plata se face prin contul tău HIR. Pentru întrebări, contactează suportul.
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
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-base font-semibold ${earningsColor}`}>
        {earnings.toFixed(2)}
        <span className="ml-1 text-[10px] font-normal text-zinc-500">RON</span>
      </p>
      <p className="mt-0.5 text-[10px] text-zinc-500">
        {count} {count === 1 ? 'livrare' : 'livrări'}
      </p>
    </div>
  );
}
