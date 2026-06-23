'use client';

import { useState, useTransition } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { setFleetAutoDispatchAction } from '../actions';

/**
 * Fleet-level auto-dispatch switch. ON = open-pool orders are auto-OFFERED to the
 * nearest available online courier (proximity + load). OFF = manual allocation
 * (you/the dispatcher assign, or couriers self-accept). Per-fleet, so it carries
 * over cleanly when the fleet is handed to another operator.
 */
export function AutoDispatchToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !enabled;
    setError(null);
    setEnabled(next); // optimistic
    start(async () => {
      const res = await setFleetAutoDispatchAction(next);
      if (!res.ok) {
        setEnabled(!next); // revert
        setError(res.error);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-violet-300">
          <Zap className="h-5 w-5" aria-hidden />
        </span>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="block text-sm font-semibold text-zinc-100">
              Dispecerizare automată
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Dispecerizare automată"
              onClick={toggle}
              disabled={pending}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-60 ${
                enabled ? 'bg-violet-500' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                  enabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {enabled
              ? 'Comenzile noi sunt oferite automat celui mai apropiat curier online (proximitate + încărcare). Poți prelua manual oricând.'
              : 'Aloci tu comenzile (manual) sau curierii le acceptă din pool. Activează pentru oferte automate după proximitate.'}
          </p>
          {pending ? (
            <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-zinc-400">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Se salvează…
            </p>
          ) : null}
          {error ? (
            <p className="mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
