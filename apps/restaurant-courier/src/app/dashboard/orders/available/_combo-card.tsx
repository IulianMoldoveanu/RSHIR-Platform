'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Hand, Check, AlertTriangle } from 'lucide-react';
import type { ComboSuggestion } from '@/lib/combo-engine';

type Props = {
  combo: ComboSuggestion;
  disabled: boolean;
  onClaimed: (orderIds: string[]) => void;
};

type State = 'idle' | 'claiming' | 'done' | 'partial' | 'error';

export function ComboCard({ combo, disabled, onClaimed }: Props) {
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function claimAll() {
    if (disabled || state === 'claiming' || state === 'done') return;
    setState('claiming');
    setErrorMsg(null);

    // Sequential claim so we know exactly which orders we got.
    const taken: string[] = [];
    for (const orderId of combo.order_ids) {
      try {
        const res = await fetch(`/api/orders/${orderId}/self-pickup`, {
          method: 'POST',
          credentials: 'same-origin',
        });
        if (res.ok) {
          taken.push(orderId);
        } else if (res.status === 409) {
          // Already taken — skip, continue with the rest.
          continue;
        } else if (res.status === 422) {
          // Hit max_parallel — stop, fall through.
          break;
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    if (taken.length === 0) {
      setState('error');
      setErrorMsg('Toate au fost luate între timp');
      return;
    }
    if (taken.length === combo.order_ids.length) {
      setState('done');
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.([100, 60, 100]);
      }
      startTransition(() => {
        onClaimed(taken);
        router.push('/dashboard/orders');
      });
      return;
    }
    setState('partial');
    setErrorMsg(`Am luat ${taken.length} din ${combo.order_ids.length}`);
    startTransition(() => onClaimed(taken));
  }

  if (state === 'done') {
    return (
      <article className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500/15 p-4 text-sm font-semibold text-emerald-200">
        <Check className="h-4 w-4" aria-hidden />
        Combo asignat — se deschide…
      </article>
    );
  }

  return (
    <article className="rounded-2xl border-2 border-violet-500/40 bg-gradient-to-br from-violet-950/40 via-hir-surface to-hir-surface p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 ring-1 ring-violet-500/40">
            <Sparkles className="h-4 w-4 text-violet-300" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-bold text-violet-100">
              Combo {combo.order_ids.length} comenzi
            </p>
            <p className="text-[11px] text-violet-200/70">{combo.zone_label} · ~{combo.estimated_minutes} min total</p>
          </div>
        </div>
        <div className="rounded-lg bg-emerald-500/15 px-2.5 py-1 ring-1 ring-inset ring-emerald-500/30">
          <span className="text-base font-bold tabular-nums text-emerald-200">
            +{combo.total_fee_ron.toFixed(2)} RON
          </span>
        </div>
      </header>

      <p className="mt-3 text-[11px] leading-relaxed text-violet-200/80">
        Toate comenzile sunt în aceeași zonă, &lt; 1.5 km între ele.
        Iei toate într-un singur drum.
      </p>

      <button
        type="button"
        onClick={claimAll}
        disabled={disabled || state === 'claiming'}
        aria-label="Iau tot comboul"
        className="mt-3 flex w-full min-h-[52px] items-center justify-center gap-2 rounded-lg bg-violet-500 px-4 py-2.5 text-base font-bold text-white shadow-md shadow-violet-500/30 transition-all hover:bg-violet-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Hand className="h-4 w-4" aria-hidden />
        {state === 'claiming' ? `Iau (${combo.order_ids.length})…` : 'IAU COMBO'}
      </button>

      {state === 'partial' || state === 'error' ? (
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-amber-200">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          {errorMsg}
        </p>
      ) : null}
    </article>
  );
}
