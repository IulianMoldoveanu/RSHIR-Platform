'use client';

import { useState, useTransition } from 'react';
import { toast } from '@hir/ui';
import { revertAgentRun } from './actions';
import type { AgentRunRow, AgentRunStatus } from '@/lib/agents/runs';

type Decorated = AgentRunRow & { revertable: boolean };

const STATUS_LABELS: Record<AgentRunStatus, { label: string; cls: string }> = {
  PROPOSED: { label: 'Propusă', cls: 'bg-amber-50 text-amber-700' },
  EXECUTED: { label: 'Executată', cls: 'bg-emerald-50 text-emerald-700' },
  REVERTED: { label: 'Anulată', cls: 'bg-zinc-100 text-zinc-600' },
  REJECTED: { label: 'Respinsă', cls: 'bg-rose-50 text-rose-700' },
};

export function ActivityList({
  tenantId,
  canRevert,
  runs,
}: {
  tenantId: string;
  canRevert: boolean;
  runs: Decorated[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = runs.find((r) => r.id === openId) ?? null;

  return (
    <>
      <ul className="flex flex-col gap-2">
        {runs.map((r) => {
          const meta = STATUS_LABELS[r.status] ?? STATUS_LABELS.EXECUTED;
          return (
            <li
              key={r.id}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}
                  >
                    {meta.label}
                  </span>
                  <span className="text-xs font-mono text-zinc-500">
                    {r.agent_name ?? 'agent'}
                  </span>
                  <span className="text-xs font-mono text-zinc-400">
                    {r.action_type ?? '—'}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {r.created_at
                      ? new Date(r.created_at).toLocaleString('ro-RO')
                      : '—'}
                  </span>
                </div>
                <p className="text-sm text-zinc-800">
                  {r.summary ?? r.action_type ?? 'Acțiune AI'}
                </p>
                {r.reverted_reason && (
                  <p className="text-xs italic text-zinc-500">
                    Motiv anulare: {r.reverted_reason}
                  </p>
                )}
              </div>
              <div className="flex flex-none items-center gap-2">
                <button
                  type="button"
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  onClick={() => setOpenId(r.id)}
                >
                  Detalii
                </button>
                {canRevert && r.revertable && (
                  <RevertButton tenantId={tenantId} runId={r.id} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {open && <DetailModal run={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

function RevertButton({ tenantId, runId }: { tenantId: string; runId: string }) {
  const [pending, start] = useTransition();
  function onClick() {
    if (pending) return;
    const reason = window.prompt('Motiv anulare (opțional):') ?? '';
    if (reason === null) return; // cancelled prompt
    start(async () => {
      const res = await revertAgentRun(tenantId, { runId, reason });
      if (!res.ok) {
        toast.error(`Anulare eșuată: ${res.error}`);
        return;
      }
      toast.success('Acțiune anulată.');
    });
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
    >
      {pending ? 'Se anulează…' : 'Anulează'}
    </button>
  );
}

function DetailModal({ run, onClose }: { run: Decorated; onClose: () => void }) {
  const json = JSON.stringify(run.payload ?? null, null, 2);
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col gap-3 overflow-hidden rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-zinc-900">
            {run.action_type ?? 'Detaliu acțiune'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100"
          >
            închide
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs text-zinc-600">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-400">Agent</div>
            <div className="font-mono">{run.agent_name ?? '—'}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-400">Status</div>
            <div className="font-mono">{run.status}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-400">Creat</div>
            <div>{run.created_at ? new Date(run.created_at).toLocaleString('ro-RO') : '—'}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-400">Anulat</div>
            <div>{run.reverted_at ? new Date(run.reverted_at).toLocaleString('ro-RO') : '—'}</div>
          </div>
        </div>
        <pre className="max-h-[50vh] overflow-auto rounded-md bg-zinc-900 p-3 text-[11px] leading-relaxed text-zinc-100">
{json}
        </pre>
      </div>
    </div>
  );
}
