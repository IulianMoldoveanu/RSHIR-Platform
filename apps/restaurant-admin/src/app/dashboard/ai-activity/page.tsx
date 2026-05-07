import { Activity, ListChecks } from 'lucide-react';
import Link from 'next/link';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { listAgentRuns } from '@/lib/ai/activity-queries';
import { RUN_STATE_LABELS } from '@/lib/ai/master-orchestrator-types';
import { RunActions } from './run-actions';

export const dynamic = 'force-dynamic';

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function StateBadge({ state }: { state: string | null }) {
  const label = state && state in RUN_STATE_LABELS
    ? RUN_STATE_LABELS[state as keyof typeof RUN_STATE_LABELS]
    : (state ?? '—');
  const tone =
    state === 'PROPOSED' ? 'bg-amber-50 text-amber-800 border-amber-200'
    : state === 'EXECUTED' ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
    : state === 'REVERTED' ? 'bg-zinc-100 text-zinc-700 border-zinc-300'
    : state === 'REJECTED' ? 'bg-rose-50 text-rose-800 border-rose-200'
    : 'bg-zinc-50 text-zinc-700 border-zinc-200';
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {label}
    </span>
  );
}

export default async function AiActivityPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);
  const isOwner = role === 'OWNER';

  const [proposed, executed, reverted] = await Promise.all([
    listAgentRuns(tenant.id, { state: 'PROPOSED', limit: 25 }),
    listAgentRuns(tenant.id, { state: 'EXECUTED', limit: 50 }),
    listAgentRuns(tenant.id, { state: 'REVERTED', limit: 25 }),
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
            <Activity className="h-5 w-5 text-purple-600" aria-hidden />
            Jurnal AI
          </h1>
          <p className="text-sm text-zinc-600">
            Tot ce a propus sau a făcut asistentul AI, cu posibilitate de anulare în 24 de ore.
          </p>
        </div>
        <Link
          href="/dashboard/settings/ai-trust"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
        >
          <ListChecks className="h-4 w-4" aria-hidden />
          Setări încredere
        </Link>
      </header>

      {/* PROPOSED — pending owner approval */}
      <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-5">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-amber-800">
          În așteptare ({proposed.length})
        </p>
        <h2 className="mt-1 text-base font-semibold text-zinc-900">Propuneri pentru aprobare</h2>
        {proposed.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-amber-200 bg-white/60 p-4 text-sm text-zinc-600">
            Nicio propunere în așteptare. Când AI-ul va sugera o acțiune ce necesită aprobare, apare aici.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {proposed.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-amber-200 bg-white px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StateBadge state={row.state} />
                    {row.awaitingExecute && (
                      <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                        Aprobat — în așteptarea execuției
                      </span>
                    )}
                    <span className="text-[11px] font-mono text-zinc-500">{row.actionType ?? '—'}</span>
                  </div>
                  <p className="mt-1 truncate text-zinc-900">{row.summary ?? '(fără rezumat)'}</p>
                  <p className="text-[11px] text-zinc-500">{formatDateTime(row.createdAt)}</p>
                </div>
                {isOwner && !row.awaitingExecute && (
                  <RunActions
                    tenantId={tenant.id}
                    runId={row.id}
                    state="PROPOSED"
                    canRevert={false}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* EXECUTED — recent + revertable */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Aplicate recent ({executed.length})
        </p>
        <h2 className="mt-1 text-base font-semibold text-zinc-900">Acțiuni efectuate</h2>
        {executed.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
            Nicio acțiune înregistrată încă.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {executed.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-zinc-100 bg-zinc-50/60 px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StateBadge state={row.state} />
                    <span className="text-[11px] font-mono text-zinc-500">{row.actionType ?? '—'}</span>
                  </div>
                  <p className="mt-1 truncate text-zinc-900">{row.summary ?? '(fără rezumat)'}</p>
                  <p className="text-[11px] text-zinc-500">{formatDateTime(row.createdAt)}</p>
                </div>
                {isOwner && (
                  <RunActions
                    tenantId={tenant.id}
                    runId={row.id}
                    state="EXECUTED"
                    canRevert={row.canRevert}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* REVERTED — historical */}
      {reverted.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Anulate ({reverted.length})
          </p>
          <h2 className="mt-1 text-base font-semibold text-zinc-900">Acțiuni anulate</h2>
          <ul className="mt-3 flex flex-col gap-1.5">
            {reverted.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-zinc-100 bg-zinc-50/60 px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StateBadge state={row.state} />
                    <span className="text-[11px] font-mono text-zinc-500">{row.actionType ?? '—'}</span>
                  </div>
                  <p className="mt-1 truncate text-zinc-900">{row.summary ?? '(fără rezumat)'}</p>
                  <p className="text-[11px] text-zinc-500">
                    {formatDateTime(row.createdAt)}
                    {row.revertedAt ? ` · anulată la ${formatDateTime(row.revertedAt)}` : ''}
                    {row.revertedReason ? ` · "${row.revertedReason}"` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
