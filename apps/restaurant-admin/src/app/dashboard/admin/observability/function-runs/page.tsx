// Lane 9 — platform-admin observability for Edge Function runs.
//
// Reads `public.function_runs` (populated by the `withRunLog` helper that
// wraps each Edge Function). Shows three sections:
//   1) Per-function aggregates over the last 24h: total runs, error rate,
//      p95 duration. Sourced by aggregating in JS over the recent slice
//      (Postgres has the indexes; we keep this simple for now).
//   2) Last 50 runs table with status pill, duration, error_text preview.
//   3) An empty-state nudge when no rows exist yet.
//
// Auth: platform-admin allow-list (HIR_PLATFORM_ADMIN_EMAILS) — matches the
// /dashboard/admin/observability/materialized-views pattern. Read goes via
// the service-role admin client because function_runs has RLS enabled with
// no policies (intentional — service-role only).

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  function_name: string;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  status: 'RUNNING' | 'SUCCESS' | 'ERROR';
  error_text: string | null;
  metadata: Record<string, unknown> | null;
  tenant_id: string | null;
};

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.max(0, Math.floor(ms / 1000))}s`;
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} z`;
}

function fmtMs(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function p95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return sorted[idx];
}

type Aggregate = {
  function_name: string;
  total: number;
  errors: number;
  running: number;
  p95_ms: number | null;
};

function aggregate(rows: Row[]): Aggregate[] {
  const cutoff = Date.now() - 24 * 3600 * 1000;
  const recent = rows.filter((r) => new Date(r.started_at).getTime() >= cutoff);
  const byName = new Map<string, Row[]>();
  for (const r of recent) {
    const arr = byName.get(r.function_name) ?? [];
    arr.push(r);
    byName.set(r.function_name, arr);
  }
  const out: Aggregate[] = [];
  for (const [name, arr] of byName) {
    const durations = arr
      .map((r) => r.duration_ms)
      .filter((v): v is number => typeof v === 'number');
    out.push({
      function_name: name,
      total: arr.length,
      errors: arr.filter((r) => r.status === 'ERROR').length,
      running: arr.filter((r) => r.status === 'RUNNING').length,
      p95_ms: p95(durations),
    });
  }
  return out.sort((a, b) => b.total - a.total);
}

export default async function FunctionRunsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect('/login');

  if (!isPlatformAdminEmail(user.email)) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Acces interzis: această pagină este rezervată administratorilor HIR.
      </div>
    );
  }

  const admin = createAdminClient() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        order: (
          c: string,
          opts: { ascending: boolean },
        ) => {
          limit: (n: number) => Promise<{ data: unknown; error: { message: string } | null }>;
        };
      };
    };
  };

  // Pull last 500 to cover the 24h aggregate window comfortably; the table
  // below shows only the first 50. Index on (function_name, started_at desc)
  // keeps this cheap.
  const res = await admin
    .from('function_runs')
    .select(
      'id, function_name, started_at, ended_at, duration_ms, status, error_text, metadata, tenant_id',
    )
    .order('started_at', { ascending: false })
    .limit(500);
  const rows: Row[] = (res.data as Row[] | null) ?? [];
  const aggregates = aggregate(rows);
  const recent = rows.slice(0, 50);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Edge Functions — telemetrie
        </h1>
        <p className="text-sm text-zinc-600">
          Ultimele rulări ale funcțiilor Edge instrumentate cu{' '}
          <code className="rounded bg-zinc-100 px-1">withRunLog</code>. Agregate pe
          ultimele 24 ore, plus ultimele 50 rulări individuale.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-md border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-600">
          Nicio rulare înregistrată încă. Funcțiile instrumentate vor apărea aici după prima invocare.
        </div>
      ) : (
        <>
          <section className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Ultimele 24 ore — pe funcție
            </div>
            <table className="w-full text-sm">
              <thead className="bg-white text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Funcție</th>
                  <th className="px-3 py-2">Rulări</th>
                  <th className="px-3 py-2">Erori</th>
                  <th className="px-3 py-2">Rată erori</th>
                  <th className="px-3 py-2">În execuție</th>
                  <th className="px-3 py-2">p95 durată</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {aggregates.map((a) => {
                  const errRate = a.total > 0 ? (a.errors / a.total) * 100 : 0;
                  const errClass =
                    errRate >= 10
                      ? 'font-semibold text-rose-700'
                      : errRate >= 1
                      ? 'text-amber-700'
                      : 'text-zinc-700';
                  return (
                    <tr key={a.function_name} className="hover:bg-zinc-50">
                      <td className="px-3 py-2 font-medium text-zinc-900">
                        <code className="text-xs">{a.function_name}</code>
                      </td>
                      <td className="px-3 py-2 text-zinc-700">{a.total}</td>
                      <td
                        className={
                          'px-3 py-2 ' +
                          (a.errors > 0 ? 'font-semibold text-rose-700' : 'text-zinc-700')
                        }
                      >
                        {a.errors}
                      </td>
                      <td className={'px-3 py-2 ' + errClass}>{errRate.toFixed(1)}%</td>
                      <td className="px-3 py-2 text-zinc-700">{a.running}</td>
                      <td className="px-3 py-2 text-zinc-700">{fmtMs(a.p95_ms)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
              Ultimele 50 rulări
            </h2>
            <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Funcție</th>
                    <th className="px-3 py-2">Început</th>
                    <th className="px-3 py-2">Stare</th>
                    <th className="px-3 py-2">Durată</th>
                    <th className="px-3 py-2">Eroare</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {recent.map((r) => {
                    const pillClass =
                      r.status === 'SUCCESS'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : r.status === 'ERROR'
                        ? 'border-rose-200 bg-rose-50 text-rose-800'
                        : 'border-amber-200 bg-amber-50 text-amber-800';
                    return (
                      <tr key={r.id} className="hover:bg-zinc-50">
                        <td className="px-3 py-2 font-medium text-zinc-900">
                          <code className="text-xs">{r.function_name}</code>
                        </td>
                        <td className="px-3 py-2 text-zinc-700">{timeAgo(r.started_at)}</td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              'inline-flex rounded-full border px-2 py-0.5 text-xs ' + pillClass
                            }
                          >
                            {r.status.toLowerCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-zinc-700">{fmtMs(r.duration_ms)}</td>
                        <td className="px-3 py-2">
                          {r.error_text ? (
                            <span
                              className="block max-w-md truncate text-xs text-rose-700"
                              title={r.error_text}
                            >
                              {r.error_text}
                            </span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
