'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type State =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ok'; runId: string; mismatchCount: number }
  | { kind: 'error'; message: string };

export function RunVerifierButton() {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function run() {
    setState({ kind: 'running' });
    try {
      const res = await fetch('/api/admin/audit/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ kind: 'error', message: json?.error ?? `HTTP ${res.status}` });
        return;
      }
      setState({
        kind: 'ok',
        runId: json.run_id,
        mismatchCount: json.mismatch_count ?? 0,
      });
      startTransition(() => router.refresh());
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'eroare necunoscută' });
    }
  }

  const busy = state.kind === 'running' || pending;

  return (
    <div className="flex items-center gap-3">
      {state.kind === 'ok' && (
        <span
          className={`text-xs ${
            state.mismatchCount === 0 ? 'text-emerald-700' : 'text-rose-700'
          }`}
        >
          {state.mismatchCount === 0
            ? 'Lanț intact.'
            : `${state.mismatchCount} discrepanțe — alertă trimisă pe Telegram.`}
        </span>
      )}
      {state.kind === 'error' && (
        <span className="text-xs text-rose-700">Eroare: {state.message}</span>
      )}
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? 'Verific…' : 'Rulează verificarea'}
      </button>
    </div>
  );
}
