'use client';

// Client island — withdraws a still-PENDING offer with a single confirm step
// so a mistapped row doesn't terminate a live bid. Server action re-checks
// fleet ownership + PENDING status before committing.

import { useState, useTransition } from 'react';
import { Loader2, X } from 'lucide-react';
import { withdrawOfferAction } from '../actions';

export function WithdrawButton({ offerId }: { offerId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    // Single confirm so a click on the wrong row in a busy list doesn't
    // kill a bid that's about to win. Localised string — the rest of the
    // UI in this app is Romanian.
    if (!window.confirm('Sigur retragi oferta? Va trebui să trimiți una nouă.')) {
      return;
    }
    startTransition(async () => {
      const r = await withdrawOfferAction(offerId);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : (
          <X className="h-3 w-3" aria-hidden />
        )}
        Retrage
      </button>
      {error ? (
        <p className="text-[10px] text-rose-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
