// Lane S — Audit chain integrity dashboard.
// Platform-admin-only, read-only. Manual "Run verifier now" calls
// POST /api/admin/audit/verify which fires Telegram on any mismatch.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { RunVerifierButton } from './run-button';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RunRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  range_start: string | null;
  range_end: string | null;
  mismatches: number;
  triggered_by: string | null;
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'acum';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} z`;
}

export default async function AuditIntegrityPage() {
  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user?.email) redirect('/login?next=/dashboard/admin/observability/audit-integrity');

  const allow = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allow.includes(user.email.toLowerCase())) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Acces interzis: această pagină este rezervată administratorilor HIR.
      </div>
    );
  }

  const admin = createAdminClient() as unknown as {
    from: (t: string) => {
      select: (cols: string, opts?: { count?: 'exact'; head?: boolean }) => {
        order: (
          c: string,
          o: { ascending: boolean },
        ) => {
          limit: (n: number) => Promise<{ data: RunRow[] | null; count?: number | null; error: { message: string } | null }>;
        };
        gte?: (c: string, v: string) => Promise<{ count: number | null; error: { message: string } | null }>;
      };
    };
  };

  // Total audit_log rows (head-count, no rows transferred).
  const totalRowsRes = await (admin as unknown as {
    from: (t: string) => {
      select: (
        cols: string,
        opts: { count: 'exact'; head: true },
      ) => Promise<{ count: number | null; error: { message: string } | null }>;
    };
  })
    .from('audit_log')
    .select('id', { count: 'exact', head: true });

  const totalRows = totalRowsRes.count ?? 0;

  // Recent verifier runs.
  const runsRes = await admin
    .from('audit_log_verifier_runs')
    .select('id, started_at, finished_at, range_start, range_end, mismatches, triggered_by')
    .order('started_at', { ascending: false })
    .limit(10);
  const runs = runsRes.data ?? [];
  const lastRun = runs[0] ?? null;

  // Mismatch count last 7 days (sum across runs).
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recentRunsRes = await (admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        gte: (c: string, v: string) => Promise<{ data: { mismatches: number }[] | null; error: { message: string } | null }>;
      };
    };
  })
    .from('audit_log_verifier_runs')
    .select('mismatches')
    .gte('started_at', sevenDaysAgo);
  const mismatches7d = (recentRunsRes.data ?? []).reduce(
    (acc, r) => acc + (r.mismatches > 0 ? r.mismatches : 0),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Integritate jurnal de audit</h1>
        <p className="text-sm text-zinc-600">
          Lanț hash SHA-256 peste <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">audit_log</code>.
          Detectează modificări retrospective ale rândurilor existente.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Total rânduri audit</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900">{totalRows.toLocaleString('ro-RO')}</div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Ultima verificare</div>
          {lastRun ? (
            <div className="mt-2">
              <div className="text-sm text-zinc-700">acum {timeAgo(lastRun.started_at)}</div>
              <div className="mt-1 text-xs text-zinc-500">
                {lastRun.mismatches === 0 ? (
                  <span className="text-emerald-700">lanț intact</span>
                ) : lastRun.mismatches < 0 ? (
                  <span className="text-amber-700">eroare la rulare</span>
                ) : (
                  <span className="text-rose-700">{lastRun.mismatches} discrepanțe</span>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-zinc-500">niciodată</div>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Discrepanțe (ultimele 7z)</div>
          <div
            className={`mt-2 text-2xl font-semibold tabular-nums ${
              mismatches7d === 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {mismatches7d}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-900">Rulează verificarea acum</h2>
          <RunVerifierButton />
        </div>
        <p className="mt-2 text-sm text-zinc-600">
          Apasă pentru a recalcula lanțul hash pe toate rândurile cu <code>row_hash</code> setat.
          Discrepanțele declanșează automat o alertă pe Telegram către operator.
        </p>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-medium text-zinc-900">Istoric rulări</h2>
        {runs.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Nicio rulare încă.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-2 py-2 text-left font-medium">Început</th>
                  <th className="px-2 py-2 text-left font-medium">Durată</th>
                  <th className="px-2 py-2 text-left font-medium">Discrepanțe</th>
                  <th className="px-2 py-2 text-left font-medium">Inițiator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {runs.map((r) => {
                  const dur =
                    r.finished_at && r.started_at
                      ? Math.max(0, new Date(r.finished_at).getTime() - new Date(r.started_at).getTime())
                      : null;
                  return (
                    <tr key={r.id}>
                      <td className="px-2 py-2 text-zinc-700">acum {timeAgo(r.started_at)}</td>
                      <td className="px-2 py-2 tabular-nums text-zinc-600">
                        {dur != null ? `${(dur / 1000).toFixed(1)}s` : 'în curs'}
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {r.mismatches === 0 ? (
                          <span className="text-emerald-700">0</span>
                        ) : r.mismatches < 0 ? (
                          <span className="text-amber-700">eroare</span>
                        ) : (
                          <span className="text-rose-700">{r.mismatches}</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-zinc-600">{r.triggered_by ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
