// /admin/observability/courier-health
// F6 observability surface — server-rendered, force-dynamic.
// Auth: PLATFORM_ADMIN only (enforced by /admin/layout.tsx + explicit guard).
//
// Sections:
//   1. Cron schedule + last health-monitor run (static config + function_runs).
//      NOTE: GPS purge + medical purge crons do not write to function_runs —
//      their last-run status is not queryable via the PostgREST API (cron.*
//      schema is not exposed). Schedule metadata is surfaced from static config.
//   2. Recent health-monitor warnings (function_runs, status = 'warning').
//   3. Medical access volume (count only — no PII).
//   4. Active shifts + in-flight orders (snapshot gauges).

import { requirePlatformAdmin } from '@/lib/platform-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

type FunctionRunRow = {
  id: string;
  function_name: string;
  started_at: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

// --------------------------------------------------------------------------
// Static cron config — sourced from migrations, never changes at runtime.
// --------------------------------------------------------------------------

const CRON_JOBS = [
  {
    jobname: 'courier-health-monitor',
    label: 'Monitor anomalii operaționale',
    schedule: '*/5 * * * *',
    scheduleRo: 'La fiecare 5 minute',
    writesToFunctionRuns: true,
    functionName: 'courier.healthMonitor',
  },
  {
    jobname: 'courier-gps-dpa-30day-purge',
    label: 'Purgare GPS (DPA, 30 zile)',
    schedule: '30 2 * * *',
    scheduleRo: 'Zilnic la 02:30 UTC',
    writesToFunctionRuns: false,
    functionName: null,
  },
  {
    jobname: 'medical-access-logs-5y-purge',
    label: 'Purgare acces medical (DPA, 5 ani)',
    schedule: '30 2 * * 0',
    scheduleRo: 'Duminică la 02:30 UTC',
    writesToFunctionRuns: false,
    functionName: null,
  },
] as const;

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function fmtRoDatetime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' });
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.max(0, Math.floor(ms / 1000))}s în urmă`;
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min în urmă`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h în urmă`;
  return `${Math.floor(h / 24)} zile în urmă`;
}

function isStale(iso: string | null, thresholdMinutes: number): boolean {
  if (!iso) return true;
  return Date.now() - new Date(iso).getTime() > thresholdMinutes * 60_000;
}

// --------------------------------------------------------------------------
// Page
// --------------------------------------------------------------------------

export default async function CourierHealthPage() {
  await requirePlatformAdmin();

  const admin = createAdminClient();

  // ── Section 2: recent warnings from health monitor ─────────────────────
  const { data: warningRows } = await (
    admin as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              order: (col: string, opts: { ascending: boolean }) => {
                limit: (n: number) => Promise<{ data: unknown }>;
              };
            };
          };
        };
      };
    }
  )
    .from('function_runs')
    .select('id, function_name, started_at, status, metadata')
    .eq('function_name', 'courier.healthMonitor')
    .eq('status', 'warning')
    .order('started_at', { ascending: false })
    .limit(20);

  const warnings: FunctionRunRow[] = (warningRows as FunctionRunRow[] | null) ?? [];

  // ── Last successful health-monitor run (for Section 1) ─────────────────
  const { data: lastRunRows } = await (
    admin as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: unknown }>;
            };
          };
        };
      };
    }
  )
    .from('function_runs')
    .select('id, function_name, started_at, status, metadata')
    .eq('function_name', 'courier.healthMonitor')
    .order('started_at', { ascending: false })
    .limit(1);

  const lastHealthRun: FunctionRunRow | null =
    ((lastRunRows as FunctionRunRow[] | null) ?? [])[0] ?? null;

  // ── Section 3: medical access counts ──────────────────────────────────
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { count: medTotal } = await (
    admin as unknown as {
      from: (t: string) => {
        select: (cols: string, opts: { count: string; head: boolean }) => Promise<{
          count: number | null;
        }>;
      };
    }
  )
    .from('medical_access_logs')
    .select('*', { count: 'exact', head: true });

  const { count: med24h } = await (
    admin as unknown as {
      from: (t: string) => {
        select: (cols: string, opts: { count: string; head: boolean }) => {
          gte: (col: string, val: string) => Promise<{ count: number | null }>;
        };
      };
    }
  )
    .from('medical_access_logs')
    .select('*', { count: 'exact', head: true })
    .gte('accessed_at', twentyFourHoursAgo);

  // ── Section 4: active shifts + in-flight orders ───────────────────────
  const { count: onlineShifts } = await (
    admin as unknown as {
      from: (t: string) => {
        select: (cols: string, opts: { count: string; head: boolean }) => {
          eq: (col: string, val: string) => Promise<{ count: number | null }>;
        };
      };
    }
  )
    .from('courier_shifts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ONLINE');

  // courier_orders in-flight: ACCEPTED, PICKED_UP, IN_TRANSIT
  // We query each status separately because the Supabase JS client's
  // PostgREST binding doesn't expose .in() in the chainable typed cast
  // without a more complex overload. Three tiny head-only requests.
  const inFlightStatuses = ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'] as const;
  const inFlightCounts = await Promise.all(
    inFlightStatuses.map((s) =>
      (
        admin as unknown as {
          from: (t: string) => {
            select: (cols: string, opts: { count: string; head: boolean }) => {
              eq: (col: string, val: string) => Promise<{ count: number | null }>;
            };
          };
        }
      )
        .from('courier_orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', s),
    ),
  );
  const ordersInFlight = inFlightCounts.reduce((sum, r) => sum + (r.count ?? 0), 0);

  // ── Derived: last 24h warning check ───────────────────────────────────
  const hasRecentWarning =
    warnings.length > 0 &&
    !isStale(warnings[0]?.started_at ?? null, 24 * 60);

  return (
    <div className="flex flex-col gap-8">
      {/* Page header */}
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
          Stare operațională curieri
        </h1>
        <p className="text-sm text-zinc-500">
          Date în timp real. Pagina se reîncarcă la fiecare cerere (force-dynamic).
        </p>
      </header>

      {/* ── Section 1: Cron schedule ─────────────────────────────────────── */}
      <section aria-labelledby="crons-heading">
        <h2
          id="crons-heading"
          className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500"
        >
          Programare cron-uri
        </h2>
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Cron</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                  Programare
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                  Ultima rulare
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Stare</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {CRON_JOBS.map((job) => {
                const isHealthMonitor = job.writesToFunctionRuns;
                const lastRunAt = isHealthMonitor ? lastHealthRun?.started_at ?? null : null;
                const lastStatus = isHealthMonitor ? lastHealthRun?.status ?? null : null;
                const stale = isHealthMonitor && isStale(lastRunAt, 10);

                let statusPill: React.ReactNode;
                if (!isHealthMonitor) {
                  statusPill = (
                    <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
                      fără log
                    </span>
                  );
                } else if (stale || lastStatus === null) {
                  statusPill = (
                    <span className="inline-flex items-center rounded-full bg-amber-900/60 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                      inactiv / stale
                    </span>
                  );
                } else if (lastStatus === 'success') {
                  statusPill = (
                    <span className="inline-flex items-center rounded-full bg-emerald-900/60 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                      success
                    </span>
                  );
                } else if (lastStatus === 'warning') {
                  statusPill = (
                    <span className="inline-flex items-center rounded-full bg-amber-900/60 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                      warning
                    </span>
                  );
                } else {
                  statusPill = (
                    <span className="inline-flex items-center rounded-full bg-rose-900/60 px-2 py-0.5 text-[11px] font-medium text-rose-300">
                      {lastStatus}
                    </span>
                  );
                }

                return (
                  <tr key={job.jobname} className="hover:bg-zinc-800/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-100">{job.label}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-zinc-500">
                        {job.jobname}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-zinc-300">{job.scheduleRo}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-zinc-600">
                        {job.schedule}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {isHealthMonitor ? (
                        lastRunAt ? (
                          <span title={fmtRoDatetime(lastRunAt)}>{timeAgo(lastRunAt)}</span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )
                      ) : (
                        <span
                          className="text-zinc-600"
                          title="Cron-urile de purge nu scriu în function_runs — last-run nu este disponibil prin PostgREST"
                        >
                          nedisponibil
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{statusPill}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-600">
          Cron-urile de purge nu scriu în{' '}
          <code className="rounded bg-zinc-800 px-1">function_runs</code> — starea
          lor este vizibilă doar în Supabase Dashboard → Database → pg_cron.
        </p>
      </section>

      {/* ── Section 2: Recent health-monitor warnings ──────────────────────── */}
      <section aria-labelledby="warnings-heading">
        <h2
          id="warnings-heading"
          className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500"
        >
          Anomalii operaționale recente (health-monitor)
        </h2>
        {!hasRecentWarning ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-800/60 bg-emerald-900/20 px-5 py-4">
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-900/60 text-emerald-400 text-lg"
            >
              ✓
            </span>
            <div>
              <p className="text-sm font-semibold text-emerald-300">
                Zero anomalii — operațional curat
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                Niciun warning al health-monitor-ului în ultimele 24 de ore.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {warnings.map((run) => {
              const meta = run.metadata ?? {};
              const stuckPickedUp = meta['stuck_picked_up'] ?? 0;
              const onlineNoPing = meta['online_no_ping'] ?? 0;
              const nullTenantAudit = meta['null_tenant_audit'] ?? 0;

              return (
                <div
                  key={run.id}
                  className="rounded-xl border border-amber-800/60 bg-amber-900/10 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-semibold text-amber-300">
                      {fmtRoDatetime(run.started_at)}
                    </span>
                    <span className="inline-flex rounded-full bg-amber-900/60 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                      warning
                    </span>
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-3">
                    <div>
                      <dt className="text-[11px] text-zinc-500">Comenzi blocate (PICKED_UP &gt;60 min)</dt>
                      <dd
                        className={`mt-0.5 text-lg font-bold tabular-nums ${
                          Number(stuckPickedUp) > 0 ? 'text-rose-400' : 'text-zinc-400'
                        }`}
                      >
                        {String(stuckPickedUp)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-zinc-500">Curieri ONLINE fără ping (&gt;5 min)</dt>
                      <dd
                        className={`mt-0.5 text-lg font-bold tabular-nums ${
                          Number(onlineNoPing) > 0 ? 'text-rose-400' : 'text-zinc-400'
                        }`}
                      >
                        {String(onlineNoPing)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-zinc-500">Audit_log fără tenant (24h)</dt>
                      <dd
                        className={`mt-0.5 text-lg font-bold tabular-nums ${
                          Number(nullTenantAudit) > 0 ? 'text-amber-400' : 'text-zinc-400'
                        }`}
                      >
                        {String(nullTenantAudit)}
                      </dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Section 3: Medical access volume ──────────────────────────────── */}
      <section aria-labelledby="medical-heading">
        <h2
          id="medical-heading"
          className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500"
        >
          Volum acces medical (fără PII)
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
            <p className="text-[11px] text-zinc-500">Accesări în ultimele 24 h</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-zinc-100">
              {med24h ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
            <p className="text-[11px] text-zinc-500">Total înregistrări (istoric)</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-zinc-100">
              {medTotal ?? 0}
            </p>
            <p className="mt-1 text-[10px] text-zinc-600">
              Retenție: 5 ani DPA. Purge: duminică 02:30 UTC.
            </p>
          </div>
        </div>
      </section>

      {/* ── Section 4: Active shifts + in-flight orders ────────────────────── */}
      <section aria-labelledby="gauges-heading">
        <h2
          id="gauges-heading"
          className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500"
        >
          Snapshot operațional curent
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
            <p className="text-[11px] text-zinc-500">Curieri ONLINE acum</p>
            <p
              className={`mt-1 text-3xl font-bold tabular-nums ${
                (onlineShifts ?? 0) > 0 ? 'text-emerald-400' : 'text-zinc-500'
              }`}
            >
              {onlineShifts ?? 0}
            </p>
            <p className="mt-1 text-[10px] text-zinc-600">courier_shifts.status = ONLINE</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
            <p className="text-[11px] text-zinc-500">Comenzi în curs (ACCEPTED / PICKED_UP / IN_TRANSIT)</p>
            <p
              className={`mt-1 text-3xl font-bold tabular-nums ${
                ordersInFlight > 0 ? 'text-violet-400' : 'text-zinc-500'
              }`}
            >
              {ordersInFlight}
            </p>
            <p className="mt-1 text-[10px] text-zinc-600">courier_orders</p>
          </div>
        </div>
      </section>
    </div>
  );
}
