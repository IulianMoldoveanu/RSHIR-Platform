// Lane X — platform-admin observability for materialized views.
//
// Lists every MV in the public schema (driven by pg_matviews via
// v_mv_refresh_status), last refresh metadata, 7-day error count, and
// flags MVs that lack a unique index (cannot REFRESH CONCURRENTLY).
//
// Auth: platform-admin allow-list (HIR_PLATFORM_ADMIN_EMAILS) — same gate
// the existing /dashboard/admin/system page uses.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';

export const dynamic = 'force-dynamic';

type StatusRow = {
  mv_schema: string;
  mv_name: string;
  size_pretty: string | null;
  size_bytes: number | null;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_duration_ms: number | null;
  last_row_count: number | null;
  last_error: string | null;
  runs_7d: number;
  errors_7d: number;
  avg_duration_ms_7d: number | null;
  max_duration_ms_7d: number | null;
  has_unique_index: boolean;
};

type RecentRow = {
  id: number;
  mv_schema: string;
  mv_name: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  row_count_after: number | null;
  error: string | null;
};

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'acum';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `acum ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `acum ${h} h`;
  return `acum ${Math.floor(h / 24)} z`;
}

function fmtMs(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function fmtNum(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('ro-RO');
}

export default async function MaterializedViewsPage() {
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
      select: (cols: string) => Promise<{ data: unknown; error: { message: string } | null }> & {
        order: (
          c: string,
          opts: { ascending: boolean },
        ) => {
          limit: (n: number) => Promise<{ data: unknown; error: { message: string } | null }>;
        };
      };
    };
  };

  const statusRes = await admin.from('v_mv_refresh_status').select('*');
  const status: StatusRow[] = (statusRes.data as StatusRow[] | null) ?? [];

  const recentRes = await admin
    .from('mv_refresh_log')
    .select('id, mv_schema, mv_name, started_at, finished_at, duration_ms, row_count_after, error')
    .order('started_at', { ascending: false })
    .limit(20);
  const recent: RecentRow[] = (recentRes.data as RecentRow[] | null) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Vizualizări materializate
        </h1>
        <p className="text-sm text-zinc-600">
          Stare ultimă reîmprospătare, durată, contor rânduri și erori în ultimele 7 zile pentru
          fiecare MV din schema <code className="rounded bg-zinc-100 px-1">public</code>.
        </p>
      </header>

      {status.length === 0 ? (
        <div className="rounded-md border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-600">
          Nu există vizualizări materializate în schema publică.
        </div>
      ) : (
        <section className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Vizualizare</th>
                <th className="px-3 py-2">Dimensiune</th>
                <th className="px-3 py-2">Ultimă rulare</th>
                <th className="px-3 py-2">Durată</th>
                <th className="px-3 py-2">Rânduri</th>
                <th className="px-3 py-2">Rulări 7z</th>
                <th className="px-3 py-2">Erori 7z</th>
                <th className="px-3 py-2">Index unic</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {status.map((r) => {
                const stale =
                  !r.last_started_at ||
                  Date.now() - new Date(r.last_started_at).getTime() > 36 * 3600 * 1000;
                return (
                  <tr key={`${r.mv_schema}.${r.mv_name}`} className="hover:bg-zinc-50">
                    <td className="px-3 py-2 font-medium text-zinc-900">
                      <code className="text-xs">
                        {r.mv_schema}.{r.mv_name}
                      </code>
                      {r.last_error && (
                        <div className="mt-1 truncate text-xs text-rose-700" title={r.last_error}>
                          {r.last_error}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-700">{r.size_pretty ?? '—'}</td>
                    <td className="px-3 py-2 text-zinc-700">
                      <span
                        className={
                          stale
                            ? 'text-amber-700'
                            : r.last_error
                            ? 'text-rose-700'
                            : 'text-emerald-700'
                        }
                      >
                        {timeAgo(r.last_started_at)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-700">{fmtMs(r.last_duration_ms)}</td>
                    <td className="px-3 py-2 text-zinc-700">{fmtNum(r.last_row_count)}</td>
                    <td className="px-3 py-2 text-zinc-700">{r.runs_7d}</td>
                    <td
                      className={
                        'px-3 py-2 ' +
                        (r.errors_7d > 0 ? 'font-semibold text-rose-700' : 'text-zinc-700')
                      }
                    >
                      {r.errors_7d}
                    </td>
                    <td className="px-3 py-2">
                      {r.has_unique_index ? (
                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
                          da
                        </span>
                      ) : (
                        <span
                          className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
                          title="Fără index unic, REFRESH CONCURRENTLY nu funcționează — adăugați un index unic."
                        >
                          lipsă
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
          Ultimele 20 reîmprospătări
        </h2>
        {recent.length === 0 ? (
          <div className="rounded-md border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-600">
            Niciun jurnal de reîmprospătare încă. Cron-ul rulează zilnic la 05:55 UTC.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Vizualizare</th>
                  <th className="px-3 py-2">Început</th>
                  <th className="px-3 py-2">Durată</th>
                  <th className="px-3 py-2">Rânduri</th>
                  <th className="px-3 py-2">Eroare</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {recent.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-2 font-medium text-zinc-900">
                      <code className="text-xs">
                        {r.mv_schema}.{r.mv_name}
                      </code>
                    </td>
                    <td className="px-3 py-2 text-zinc-700">{timeAgo(r.started_at)}</td>
                    <td className="px-3 py-2 text-zinc-700">{fmtMs(r.duration_ms)}</td>
                    <td className="px-3 py-2 text-zinc-700">{fmtNum(r.row_count_after)}</td>
                    <td className="px-3 py-2 text-rose-700">{r.error ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
