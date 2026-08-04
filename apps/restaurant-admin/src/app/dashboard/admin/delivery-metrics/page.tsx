// HIR Command Center — delivery distance + duration metrics, per fleet.
//
// Distances come from the courier's actual GPS trail (courier_location_pings
// → courier_orders.route_*), not from the straight line between two pins.
// Durations come from the order lifecycle timestamps, which have always been
// recorded — which is why the time columns have history and the distance
// columns only start filling from the day the trail shipped.
//
// Platform-admin gated, same as the rest of /dashboard/admin.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatDistanceM, formatDurationMs } from '@hir/ui';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'HIR Command Center — Metrici livrare',
  robots: 'noindex,nofollow',
};

const PERIODS = [7, 30, 90] as const;

type MetricRow = {
  fleet_id: string;
  fleet_name: string;
  delivered_count: number;
  measured_count: number;
  total_distance_m: number;
  avg_distance_m: number | null;
  avg_pickup_distance_m: number | null;
  avg_total_seconds: number | null;
  avg_to_pickup_seconds: number | null;
};

function secondsToMs(seconds: number | null): number | null {
  return seconds == null ? null : seconds * 1000;
}

export default async function DeliveryMetricsPage(props: {
  searchParams: Promise<{ days?: string }>;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login?next=/dashboard/admin/delivery-metrics');
  if (!isPlatformAdminEmail(user.email)) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-slate-100">
        <div className="mx-auto max-w-2xl rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Acces interzis: rezervat administratorilor de platformă HIR.
        </div>
      </main>
    );
  }

  const searchParams = await props.searchParams;
  const requested = Number(searchParams.days);
  const days = PERIODS.includes(requested as (typeof PERIODS)[number]) ? requested : 30;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db.rpc('fn_delivery_metrics_by_fleet', { p_days: days });
  const rows = (data ?? []) as MetricRow[];

  const totals = rows.reduce(
    (acc, r) => ({
      delivered: acc.delivered + r.delivered_count,
      measured: acc.measured + r.measured_count,
      distance: acc.distance + r.total_distance_m,
    }),
    { delivered: 0, measured: 0, distance: 0 },
  );
  const coverage =
    totals.delivered > 0 ? Math.round((totals.measured / totals.delivered) * 100) : null;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/60 bg-slate-950/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-bold">Metrici livrare</h1>
            <p className="text-xs text-slate-500">
              Distanțe reale din traseul GPS al curierilor + timpi pe ciclul comenzii, per flotă.
            </p>
          </div>
          <Link href="/dashboard/admin/hub" className="shrink-0 text-sm text-slate-400 hover:text-slate-200">
            ← Command Center
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={`/dashboard/admin/delivery-metrics?days=${p}`}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                p === days
                  ? 'border-violet-500/60 bg-violet-500/10 text-violet-200'
                  : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              ultimele {p} zile
            </Link>
          ))}
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Livrări finalizate</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{totals.delivered}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Distanță totală</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {formatDistanceM(totals.distance)}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Distanță alocată — drumul comun al comenzilor duse împreună se numără o singură dată.
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Acoperire măsurare</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {coverage == null ? '—' : `${coverage}%`}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Cât din livrări au avut destule puncte GPS. Sub 100%, mediile de distanță se citesc cu rezervă.
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-8 text-center text-sm text-slate-400">
            Nicio livrare finalizată în perioada selectată.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-900/60 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Flotă</th>
                  <th className="px-4 py-3 text-right font-semibold">Livrări</th>
                  <th className="px-4 py-3 text-right font-semibold">Măsurate</th>
                  <th className="px-4 py-3 text-right font-semibold">Distanță totală</th>
                  <th className="px-4 py-3 text-right font-semibold">Medie / livrare</th>
                  <th className="px-4 py-3 text-right font-semibold">Medie până la ridicare</th>
                  <th className="px-4 py-3 text-right font-semibold">Timp mediu</th>
                  <th className="px-4 py-3 text-right font-semibold">Timp până la ridicare</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {rows.map((r) => (
                  <tr key={r.fleet_id} className="hover:bg-slate-900/40">
                    <td className="px-4 py-3 font-medium text-slate-200">{r.fleet_name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.delivered_count}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-400">
                      {r.measured_count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatDistanceM(r.total_distance_m)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatDistanceM(r.avg_distance_m)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-400">
                      {formatDistanceM(r.avg_pickup_distance_m)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatDurationMs(secondsToMs(r.avg_total_seconds))}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-400">
                      {formatDurationMs(secondsToMs(r.avg_to_pickup_seconds))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
          Traseul GPS se păstrează 30 de zile (politica DPA); cifrele de mai sus sunt calculate la
          închiderea fiecărei comenzi și rămân disponibile și după ștergerea punctelor brute.
        </p>
      </div>
    </main>
  );
}
