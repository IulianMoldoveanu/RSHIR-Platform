'use client';

import { useActionState } from 'react';
import { extendLead, type ExtendLeadResult } from '../actions';

export function ExtendButton({
  leadId,
  disabled,
}: {
  leadId: string;
  disabled: boolean;
}) {
  const boundAction = async (
    _prev: ExtendLeadResult | null,
    _formData: FormData,
  ): Promise<ExtendLeadResult> => extendLead(leadId);

  const [result, formAction, isPending] = useActionState<
    ExtendLeadResult | null,
    FormData
  >(boundAction, null);

  if (disabled) {
    return (
      <span className="text-xs text-zinc-400">Extins deja</span>
    );
  }

  return (
    <form action={formAction}>
      {result && !result.ok && (
        <p className="mb-1 text-xs text-rose-600">{result.error}</p>
      )}
      <button
        type="submit"
        disabled={isPending || disabled}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
        aria-label="Extinde lock cu 30 zile"
      >
        {isPending ? '...' : 'Extinde +30 zile'}
      </button>
    </form>
  );
}
