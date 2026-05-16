'use client';

import { useActionState, useId } from 'react';
import { togglePoweredByHir, type ToggleResult } from './actions';

const initialState: ToggleResult | null = null;

export function AttributionToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const id = useId();
  const [result, formAction, isPending] = useActionState<ToggleResult | null, FormData>(
    togglePoweredByHir,
    initialState,
  );

  // The optimistic source of truth: prefer the latest server response if available.
  const enabled = result?.ok ? result.enabled : initialEnabled;

  return (
    <form action={formAction} className="rounded-lg border border-zinc-200 bg-white p-5">
      <label htmlFor={id} className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="text-sm font-semibold text-zinc-900">
            {enabled ? 'Badge activ' : 'Badge dezactivat'}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {enabled
              ? 'Vizitatorii site-ului tău văd „Powered by HIR" în footer.'
              : 'Footer-ul site-ului tău nu mai afișează badge-ul nostru.'}
          </p>
        </div>
        <input id={id} type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
        <button
          type="submit"
          disabled={isPending}
          className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 ${
            enabled ? 'bg-purple-600' : 'bg-zinc-300'
          }`}
          aria-pressed={enabled}
          aria-label={enabled ? 'Dezactivează badge-ul' : 'Activează badge-ul'}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </label>

      {result && !result.ok && (
        <p role="alert" className="mt-3 text-xs font-medium text-rose-700">
          {result.error}
        </p>
      )}
      {result?.ok && (
        <p role="status" className="mt-3 text-xs font-medium text-emerald-700">
          Salvat — schimbarea apare pe site în max 1-2 minute (cache).
        </p>
      )}
    </form>
  );
}
