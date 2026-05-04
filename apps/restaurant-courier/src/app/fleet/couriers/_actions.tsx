'use client';

import { useState, useTransition } from 'react';
import { Loader2, ShieldOff, ShieldCheck } from 'lucide-react';
import { reactivateCourierAction, suspendCourierAction } from '../actions';

type Props = {
  userId: string;
  status: 'INACTIVE' | 'ACTIVE' | 'SUSPENDED';
};

// Inline suspend / reactivate toggle. Suspend is gated behind a one-tap
// confirm to prevent fat-finger accidents — a confirmation overlay would
// be heavier than the action warrants on mobile.
export function CourierStatusActions({ userId, status }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmSuspend, setConfirmSuspend] = useState(false);

  function handleSuspend() {
    setError(null);
    start(async () => {
      const r = await suspendCourierAction(userId);
      if (!r.ok) setError(r.error);
      setConfirmSuspend(false);
    });
  }

  function handleReactivate() {
    setError(null);
    start(async () => {
      const r = await reactivateCourierAction(userId);
      if (!r.ok) setError(r.error);
    });
  }

  if (status === 'SUSPENDED') {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={handleReactivate}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-700/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <ShieldCheck className="h-3 w-3" aria-hidden />
          )}
          Reactivează
        </button>
        {error ? <span className="text-[11px] text-red-400">{error}</span> : null}
      </div>
    );
  }

  if (confirmSuspend) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={handleSuspend}
          className="rounded-lg bg-red-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-400 disabled:opacity-60"
        >
          {pending ? 'Se suspendă…' : 'Confirmă'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirmSuspend(false)}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
        >
          Anulează
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setConfirmSuspend(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-800"
      >
        <ShieldOff className="h-3 w-3" aria-hidden />
        Suspendă
      </button>
      {error ? <span className="text-[11px] text-red-400">{error}</span> : null}
    </div>
  );
}
