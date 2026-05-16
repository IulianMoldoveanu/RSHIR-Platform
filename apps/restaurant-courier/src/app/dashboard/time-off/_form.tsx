'use client';

import { useState, useTransition } from 'react';
import { requestTimeOffAction } from './actions';
import { cardClasses } from '@/components/card';

const REASONS = ['Concediu medical', 'Vacanță', 'Cauză personală'] as const;

type State =
  | { phase: 'idle' }
  | { phase: 'success' }
  | { phase: 'error'; message: string };

// Return today + N days as a yyyy-mm-dd string for the date input default.
function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function TimeOffForm() {
  const [state, setState] = useState<State>({ phase: 'idle' });
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await requestTimeOffAction(fd);
      if (result.ok) {
        setState({ phase: 'success' });
      } else {
        setState({ phase: 'error', message: result.error });
      }
    });
  }

  if (state.phase === 'success') {
    return (
      <div
        role="status"
        className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center"
      >
        <p className="text-base font-semibold text-emerald-300">Cerere trimisă.</p>
        <p className="mt-1 text-sm text-hir-muted-fg">
          Dispecerul va reveni cu un răspuns în cel mai scurt timp.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Reason radio group */}
      <fieldset className={cardClasses({ padding: 'lg' })}>
        <legend className="mb-4 text-sm font-semibold text-hir-fg">Motiv</legend>
        <div className="flex flex-col gap-3">
          {REASONS.map((r) => (
            <label
              key={r}
              className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-hir-border px-4 py-2.5 hover:border-violet-500/40 has-[:checked]:border-violet-500 has-[:checked]:bg-violet-500/10"
            >
              <input
                type="radio"
                name="reason"
                value={r}
                defaultChecked={r === 'Cauză personală'}
                required
                className="accent-violet-500"
              />
              <span className="text-sm text-hir-fg">{r}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Date range */}
      <div className={cardClasses({ padding: 'lg' })}>
        <p className="mb-4 text-sm font-semibold text-hir-fg">Perioadă</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="start_date" className="text-xs font-medium text-hir-muted-fg">
              Data început
            </label>
            <input
              id="start_date"
              name="start_date"
              type="date"
              required
              defaultValue={dateOffset(1)}
              className="min-h-[44px] rounded-xl border border-hir-border bg-hir-bg px-3 py-2 text-sm text-hir-fg focus:border-violet-500 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="end_date" className="text-xs font-medium text-hir-muted-fg">
              Data sfârșit
            </label>
            <input
              id="end_date"
              name="end_date"
              type="date"
              required
              defaultValue={dateOffset(1)}
              className="min-h-[44px] rounded-xl border border-hir-border bg-hir-bg px-3 py-2 text-sm text-hir-fg focus:border-violet-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Optional note */}
      <div className={cardClasses({ padding: 'lg' })}>
        <label htmlFor="note" className="mb-2 block text-sm font-semibold text-hir-fg">
          Notă opțională
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={300}
          placeholder="Detalii suplimentare (opțional)"
          className="w-full resize-none rounded-xl border border-hir-border bg-hir-bg px-3 py-2.5 text-sm text-hir-fg placeholder:text-hir-muted-fg focus:border-violet-500 focus:outline-none"
        />
      </div>

      {state.phase === 'error' ? (
        <p role="alert" className="text-sm font-medium text-rose-400">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-violet-600 px-5 text-sm font-semibold text-white hover:bg-violet-500 active:scale-[0.98] disabled:opacity-60"
      >
        {isPending ? 'Se trimite…' : 'Trimite cererea'}
      </button>
    </form>
  );
}
