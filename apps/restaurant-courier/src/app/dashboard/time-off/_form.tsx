'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, CheckCircle2, Stethoscope, Sun, User } from 'lucide-react';
import { requestTimeOffAction } from './actions';
import { cardClasses } from '@/components/card';

type Reason = {
  value: string;
  Icon: typeof Stethoscope;
  hint: string;
};

const REASONS: Reason[] = [
  { value: 'Concediu medical', Icon: Stethoscope, hint: 'Boală sau control medical' },
  { value: 'Vacanță', Icon: Sun, hint: 'Călătorie planificată' },
  { value: 'Cauză personală', Icon: User, hint: 'Familie sau alte motive' },
];

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
        className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
          <CheckCircle2 className="h-6 w-6 text-emerald-300" aria-hidden />
        </span>
        <p className="text-base font-semibold text-emerald-200">Cererea ta a fost trimisă</p>
        <p className="max-w-xs text-sm leading-relaxed text-hir-muted-fg">
          Dispecerul va reveni cu un răspuns în cel mai scurt timp. O să primești
          notificare în aplicație.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Reason radio group */}
      <fieldset className={cardClasses({ padding: 'lg' })}>
        <legend className="mb-4 text-sm font-semibold text-hir-fg">Motiv</legend>
        <div className="flex flex-col gap-2">
          {REASONS.map(({ value, Icon, hint }) => (
            <label
              key={value}
              className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border border-hir-border bg-hir-bg px-4 py-2.5 transition-all hover:border-violet-500/40 has-[:checked]:border-violet-500 has-[:checked]:bg-violet-500/10 has-[:checked]:shadow-md has-[:checked]:shadow-violet-500/20 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-violet-500 has-[:focus-visible]:outline-offset-2"
            >
              <input
                type="radio"
                name="reason"
                value={value}
                defaultChecked={value === 'Cauză personală'}
                required
                className="sr-only"
              />
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/10"
              >
                <Icon className="h-4 w-4 text-violet-300" />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-medium text-hir-fg">{value}</span>
                <span className="text-[11px] text-hir-muted-fg">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Date range */}
      <div className={cardClasses({ padding: 'lg' })}>
        <p className="mb-4 text-sm font-semibold text-hir-fg">Perioadă</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="start_date" className="text-[11px] font-medium uppercase tracking-wide text-hir-muted-fg">
              Data început
            </label>
            <input
              id="start_date"
              name="start_date"
              type="date"
              required
              defaultValue={dateOffset(1)}
              className="min-h-[44px] rounded-xl border border-hir-border bg-hir-bg px-3 py-2 text-sm tabular-nums text-hir-fg transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="end_date" className="text-[11px] font-medium uppercase tracking-wide text-hir-muted-fg">
              Data sfârșit
            </label>
            <input
              id="end_date"
              name="end_date"
              type="date"
              required
              defaultValue={dateOffset(1)}
              className="min-h-[44px] rounded-xl border border-hir-border bg-hir-bg px-3 py-2 text-sm tabular-nums text-hir-fg transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
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
          className="w-full resize-none rounded-xl border border-hir-border bg-hir-bg px-3 py-2.5 text-sm leading-relaxed text-hir-fg placeholder:text-hir-muted-fg/70 transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
        />
      </div>

      {state.phase === 'error' ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm font-medium text-rose-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-300" aria-hidden />
          <span>{state.message}</span>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-violet-600 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition-all hover:bg-violet-500 hover:shadow-violet-500/40 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
      >
        {isPending ? 'Se trimite…' : 'Trimite cererea'}
      </button>
    </form>
  );
}
