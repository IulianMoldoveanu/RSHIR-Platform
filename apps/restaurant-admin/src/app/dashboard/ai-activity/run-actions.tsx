'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Undo2, X } from 'lucide-react';
import { approveProposedRun, rejectProposedRun, revertAgentRun } from './actions';

type Props = {
  tenantId: string;
  runId: string;
  state: 'PROPOSED' | 'EXECUTED';
  canRevert: boolean;
};

export function RunActions({ tenantId, runId, state, canRevert }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleApprove = () => {
    setError(null);
    start(async () => {
      const r = await approveProposedRun(tenantId, { runId });
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  };

  const handleReject = () => {
    setError(null);
    const reason = window.prompt('Motiv (opțional):') ?? undefined;
    start(async () => {
      const r = await rejectProposedRun(tenantId, { runId, reason });
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  };

  const handleRevert = () => {
    setError(null);
    const reason = window.prompt('De ce anulezi această acțiune? (opțional)') ?? undefined;
    start(async () => {
      const r = await revertAgentRun(tenantId, { runId, reason });
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-none items-center gap-1.5">
      {state === 'PROPOSED' && (
        <>
          <button
            type="button"
            onClick={handleApprove}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
          >
            <Check className="h-3.5 w-3.5" aria-hidden /> Aprobă
          </button>
          <button
            type="button"
            onClick={handleReject}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-60"
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Respinge
          </button>
        </>
      )}
      {state === 'EXECUTED' && canRevert && (
        <button
          type="button"
          onClick={handleRevert}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden /> Anulează
        </button>
      )}
      {error && <span className="text-[11px] text-rose-700">{error}</span>}
    </div>
  );
}
