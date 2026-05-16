// Platform-admin Intent Registry.
//
// F6 closure shipped `master.list_intents` (PR #524) but it's only
// reachable from Telegram or the AI dispatch API. This page surfaces
// the same static mirror (KNOWN_INTENTS) used by the live dispatcher
// so Iulian + future debugging have a visible audit of every wired
// intent without invoking the edge function.
//
// Read-only, no schema, no network — just renders the static list.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { KNOWN_INTENTS } from '@/lib/ai/master-orchestrator-types';
import {
  AGENT_FILTER_VALUES,
  computeStats,
  loadIntentsForView,
  parseAgentFilter,
  type AgentFilter,
} from './registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGENT_LABELS: Record<AgentFilter, string> = {
  all: 'Toți',
  master: 'master',
  menu: 'menu',
  marketing: 'marketing',
  ops: 'ops',
  cs: 'cs',
  analytics: 'analytics',
  finance: 'finance',
  compliance: 'compliance',
  growth: 'growth',
};

function agentChipClass(agent: string): string {
  // Distinct hue per agent to make scanning the table easier.
  switch (agent) {
    case 'master':
      return 'bg-violet-100 text-violet-800 border-violet-200';
    case 'menu':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'marketing':
      return 'bg-pink-100 text-pink-800 border-pink-200';
    case 'ops':
      return 'bg-sky-100 text-sky-800 border-sky-200';
    case 'cs':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'analytics':
      return 'bg-indigo-100 text-indigo-800 border-indigo-200';
    case 'finance':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    case 'compliance':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'growth':
      return 'bg-teal-100 text-teal-800 border-teal-200';
    default:
      return 'bg-zinc-100 text-zinc-700 border-zinc-200';
  }
}

export default async function IntentRegistryPage({
  searchParams,
}: {
  searchParams?: Promise<{ agent?: string }>;
}) {
  // ── Auth + platform-admin gate (same shape as /dashboard/admin/partners) ──
  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();

  if (!user?.email) redirect('/login?next=/dashboard/admin/intents');

  if (!isPlatformAdminEmail(user.email)) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Acces interzis: această pagină este rezervată administratorilor HIR.
      </div>
    );
  }

  // ── Resolve the agent filter from URL (Next 15 async searchParams) ──
  const sp = await searchParams;
  const filter = parseAgentFilter(sp?.agent);

  // Stats are computed on the full registry so the tiles stay stable
  // when filtering — they show the global shape, not the filtered view.
  const stats = computeStats(KNOWN_INTENTS);
  const rows = loadIntentsForView(filter);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Intent registry
        </h1>
        <p className="text-sm text-zinc-600">
          Lista completă a intent-urilor înregistrate cu master orchestrator-ul
          (F6). Sursa: oglinda statică <code className="rounded bg-zinc-100 px-1 py-0.5 text-[11px]">KNOWN_INTENTS</code>{' '}
          din <code className="rounded bg-zinc-100 px-1 py-0.5 text-[11px]">@/lib/ai/master-orchestrator-types</code>.
        </p>
      </header>

      {/* Stat tiles — global, not filter-sensitive. */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <article className="rounded-lg border border-zinc-200 bg-white p-3">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Total intents</div>
          <div className="mt-1 text-xl font-semibold text-zinc-900">{stats.total}</div>
        </article>
        <article className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-[11px] uppercase tracking-wide text-emerald-700">Read-only</div>
          <div className="mt-1 text-xl font-semibold text-emerald-900">{stats.readOnly}</div>
        </article>
        <article className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-[11px] uppercase tracking-wide text-amber-700">Mutating</div>
          <div className="mt-1 text-xl font-semibold text-amber-900">{stats.mutating}</div>
        </article>
        <article className="rounded-lg border border-zinc-200 bg-white p-3">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Agenți distincți</div>
          <div className="mt-1 text-xl font-semibold text-zinc-900">
            {Object.keys(stats.byAgent).length}
          </div>
        </article>
      </section>

      {/* Per-agent count strip. */}
      <section className="flex flex-wrap gap-2">
        {Object.entries(stats.byAgent)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([agent, count]) => (
            <span
              key={agent}
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${agentChipClass(agent)}`}
            >
              {agent} · {count}
            </span>
          ))}
      </section>

      {/* Filter UI — plain GET form so the URL stays bookmarkable + SSR-friendly. */}
      <form method="GET" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-zinc-600">
          <span className="mb-1">Filtrează după agent</span>
          <select
            name="agent"
            defaultValue={filter}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900"
          >
            {AGENT_FILTER_VALUES.map((v) => (
              <option key={v} value={v}>
                {AGENT_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
        >
          Aplică
        </button>
        {filter !== 'all' && (
          <Link
            href="/dashboard/admin/intents"
            className="text-xs font-medium text-blue-700 hover:underline"
          >
            resetează
          </Link>
        )}
      </form>

      {/* Table — sorted by agent then name. */}
      {rows.length === 0 ? (
        <div className="rounded-md border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-600">
          Nicio intenție înregistrată pentru filtrul curent. (Lista statică
          KNOWN_INTENTS nu ar trebui să fie goală — verifică
          <code className="mx-1 rounded bg-zinc-100 px-1 py-0.5 text-[11px]">master-orchestrator-types.ts</code>
          dacă vezi acest mesaj cu filtrul <em>all</em>.)
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-600">Intent</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-600">Agent</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-600">Categorie implicită</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-600">Read-only</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-600">Descriere</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((entry) => (
                <tr key={entry.name} className="hover:bg-zinc-50">
                  <td className="px-3 py-2 align-top font-mono text-xs text-zinc-900">{entry.name}</td>
                  <td className="px-3 py-2 align-top">
                    <span
                      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${agentChipClass(entry.agent)}`}
                    >
                      {entry.agent}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top font-mono text-[11px] text-zinc-700">{entry.defaultCategory}</td>
                  <td className="px-3 py-2 align-top">
                    {entry.readOnly ? (
                      <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                        ✓ read-only
                      </span>
                    ) : (
                      <span className="text-[11px] text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-zinc-700">{entry.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
