// Platform-admin-only: Sentry status tile + recent alerts.
//
// Pulls live data from:
//   - Sentry API   (errors-last-24h, top unresolved)   — needs SENTRY_AUTH_TOKEN env
//   - Supabase     (last alert sent via sentry-webhook-intake)
//
// Cache: 5 min via Next.js fetch revalidate so we don't hammer Sentry on every nav.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const SENTRY_ORG = 'hirbuild-your-dreams';
const SENTRY_BASE = 'https://de.sentry.io/api/0';
const PROJECTS: Array<{ slug: string; app: string }> = [
  { slug: 'rshir-customer', app: 'customer' },
  { slug: 'rshir-vendor', app: 'vendor' },
  { slug: 'rshir-courier', app: 'courier' },
  { slug: 'rshir-admin', app: 'admin' },
  { slug: 'rshir-backend', app: 'backend' },
];

type SentryIssue = {
  id: string;
  title: string;
  level: string;
  permalink: string;
  count: string;
  userCount: number;
  lastSeen: string;
};

type ProjectStats = {
  slug: string;
  app: string;
  errorCount24h: number | null;
  topIssues: SentryIssue[];
  error: string | null;
};

async function fetchProjectStats(slug: string, app: string, token: string): Promise<ProjectStats> {
  try {
    const issuesRes = await fetch(
      `${SENTRY_BASE}/projects/${SENTRY_ORG}/${slug}/issues/?query=is:unresolved&limit=5&statsPeriod=24h&sort=freq`,
      {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 300 },
      },
    );
    if (!issuesRes.ok) {
      return { slug, app, errorCount24h: null, topIssues: [], error: `Sentry ${issuesRes.status}` };
    }
    const issues = (await issuesRes.json()) as SentryIssue[];
    const total = issues.reduce((acc, i) => acc + parseInt(i.count, 10) || 0, 0);
    return { slug, app, errorCount24h: total, topIssues: issues.slice(0, 3), error: null };
  } catch (e) {
    return { slug, app, errorCount24h: null, topIssues: [], error: (e as Error).message };
  }
}

type LastAlertRow = {
  id: string;
  app: string | null;
  severity: string;
  issue_title: string | null;
  created_at: string;
};

async function fetchLastAlerts(): Promise<{ last: LastAlertRow | null; recent: LastAlertRow[] }> {
  const admin = createAdminClient() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        order: (
          c: string,
          opts: { ascending: boolean },
        ) => {
          limit: (n: number) => Promise<{ data: LastAlertRow[] | null; error: { message: string } | null }>;
        };
      };
    };
  };

  const { data } = await admin
    .from('sentry_events')
    .select('id, app, severity, issue_title, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  const rows = data ?? [];
  return { last: rows[0] ?? null, recent: rows };
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'acum';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} z`;
}

function severityClass(severity: string): string {
  if (severity === 'CRITICAL') return 'bg-rose-100 text-rose-800 border-rose-200';
  if (severity === 'WARN') return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-zinc-100 text-zinc-700 border-zinc-200';
}

export default async function SystemPage() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect('/login');

  const allowList = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allowList.includes(user.email.toLowerCase())) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Acces interzis: această pagină este rezervată administratorilor HIR.
      </div>
    );
  }

  const sentryToken = process.env.SENTRY_AUTH_TOKEN;
  let stats: ProjectStats[] = [];
  let sentryConfigError: string | null = null;
  if (!sentryToken) {
    sentryConfigError =
      'SENTRY_AUTH_TOKEN nu este configurat în Vercel — adaugă variabila pentru a activa contoarele live.';
    stats = PROJECTS.map((p) => ({ ...p, errorCount24h: null, topIssues: [], error: 'no token' }));
  } else {
    stats = await Promise.all(PROJECTS.map((p) => fetchProjectStats(p.slug, p.app, sentryToken)));
  }

  const { last, recent } = await fetchLastAlerts();

  const maxCount = Math.max(1, ...stats.map((s) => s.errorCount24h ?? 0));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Sentry — Status sisteme</h1>
        <p className="text-sm text-zinc-600">
          Erori în ultimele 24h pe fiecare aplicație + ultimele alerte primite. Datele se actualizează la 5 min.
        </p>
      </header>

      {sentryConfigError && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {sentryConfigError}
        </div>
      )}

      {/* Errors-per-app bars */}
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-medium text-zinc-900">Erori în ultimele 24h</h2>
        <div className="mt-4 flex flex-col gap-3">
          {stats.map((s) => {
            const w = s.errorCount24h != null ? Math.max(2, Math.round((s.errorCount24h / maxCount) * 100)) : 0;
            return (
              <div key={s.slug} className="flex items-center gap-3 text-sm">
                <div className="w-24 font-medium text-zinc-700">{s.app}</div>
                <div className="flex-1 h-6 rounded bg-zinc-100 overflow-hidden">
                  <div
                    className={`h-full ${
                      (s.errorCount24h ?? 0) > 0 ? 'bg-rose-400' : 'bg-emerald-300'
                    }`}
                    style={{ width: `${w}%` }}
                  />
                </div>
                <div className="w-16 text-right tabular-nums text-zinc-700">
                  {s.errorCount24h ?? '—'}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Top unresolved issues */}
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-medium text-zinc-900">Top probleme nerezolvate</h2>
        <div className="mt-3 flex flex-col gap-2">
          {stats.flatMap((s) => s.topIssues.map((i) => ({ app: s.app, issue: i }))).length === 0 && (
            <p className="text-sm text-zinc-500">Nimic. Liniștea costă bani — aici nu costă.</p>
          )}
          {stats
            .flatMap((s) => s.topIssues.map((i) => ({ app: s.app, issue: i })))
            .sort((a, b) => parseInt(b.issue.count, 10) - parseInt(a.issue.count, 10))
            .slice(0, 5)
            .map(({ app, issue }) => (
              <a
                key={issue.id}
                href={issue.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
              >
                <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">{app}</span>
                <span className="flex-1 truncate text-zinc-800">{issue.title}</span>
                <span className="tabular-nums text-zinc-500">{issue.count}×</span>
              </a>
            ))}
        </div>
      </section>

      {/* Last alert sent */}
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-medium text-zinc-900">Ultimele alerte trimise pe Telegram</h2>
        {last ? (
          <p className="mt-2 text-sm text-zinc-700">
            Ultima alertă: <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${severityClass(last.severity)}`}>{last.severity}</span>{' '}
            · {last.app ?? '—'} · acum {timeAgo(last.created_at)}
          </p>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">Nicio alertă încă.</p>
        )}
        <div className="mt-3 flex flex-col gap-1.5">
          {recent.map((r) => (
            <div key={r.id} className="flex items-center gap-3 text-sm">
              <span className={`inline-flex w-20 justify-center rounded border px-1 py-0.5 text-[11px] font-medium ${severityClass(r.severity)}`}>
                {r.severity}
              </span>
              <span className="w-16 text-zinc-600">{r.app ?? '—'}</span>
              <span className="flex-1 truncate text-zinc-700">{r.issue_title}</span>
              <span className="w-16 text-right tabular-nums text-zinc-500">{timeAgo(r.created_at)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
