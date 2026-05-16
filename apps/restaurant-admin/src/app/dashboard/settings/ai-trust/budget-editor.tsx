'use client';

// Inline editor for `tenants.settings.ai.monthly_budget_cents`. Server
// action `updateMonthlyBudgetCents` patches the JSONB blob; the
// dispatcher's `checkBudget` resolver in `_shared/agent-cost.ts` reads
// from the same path so the change takes effect on the next intent
// dispatch (no redeploy needed).

import { useState, useTransition } from 'react';
import { updateMonthlyBudgetCents } from './actions';

const MIN_CENTS = 100; // $1
const MAX_CENTS = 100_000; // $1000

export function BudgetEditor(props: {
  tenantId: string;
  initialCents: number;
  disabled: boolean;
}) {
  const initialDollars = (props.initialCents / 100).toFixed(2);
  const [value, setValue] = useState(initialDollars);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'success' }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  const parsedCents = Math.round(Number(value) * 100);
  const isValidNumber = Number.isFinite(parsedCents);
  const inBounds = isValidNumber && parsedCents >= MIN_CENTS && parsedCents <= MAX_CENTS;
  const dirty = parsedCents !== props.initialCents;
  const canSave = !props.disabled && !pending && dirty && inBounds;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setStatus({ kind: 'idle' });
    startTransition(async () => {
      const r = await updateMonthlyBudgetCents(props.tenantId, {
        monthly_budget_cents: parsedCents,
      });
      if (r.ok) {
        setStatus({ kind: 'success' });
      } else {
        const msg =
          r.error === 'bounds'
            ? `Bugetul trebuie să fie între $${MIN_CENTS / 100} și $${MAX_CENTS / 100}.`
            : r.error === 'forbidden'
              ? 'Doar proprietarul restaurantului poate modifica bugetul.'
              : `Nu am putut salva: ${r.error}`;
        setStatus({ kind: 'error', message: msg });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col text-sm">
        <span className="mb-1 text-xs font-medium text-zinc-600">Buget lunar AI ($)</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min={MIN_CENTS / 100}
          max={MAX_CENTS / 100}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setStatus({ kind: 'idle' });
          }}
          disabled={props.disabled || pending}
          className="w-32 rounded-md border border-zinc-300 px-3 py-2 text-sm tabular-nums shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-zinc-100 disabled:text-zinc-500"
        />
      </label>
      <button
        type="submit"
        disabled={!canSave}
        className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
      >
        {pending ? 'Se salvează…' : 'Salvează'}
      </button>
      {status.kind === 'success' && (
        <span className="text-xs font-medium text-emerald-700">Salvat.</span>
      )}
      {status.kind === 'error' && (
        <span className="text-xs text-rose-700">{status.message}</span>
      )}
      {!inBounds && isValidNumber && (
        <span className="text-xs text-amber-700">
          Interval permis: ${MIN_CENTS / 100} – ${MAX_CENTS / 100}.
        </span>
      )}
    </form>
  );
}
