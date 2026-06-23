'use client';

// Client island — withdraws a still-PENDING offer with a single confirm step
// so a mistapped row doesn't terminate a live bid. Server action re-checks
// fleet ownership + PENDING status before committing.

import { useState, useTransition } from 'react';
import { Loader2, X } from 'lucide-react';
import { withdrawOfferAction } from '../actions';
import { buttonClass } from '@/app/_marketplace-ui';

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
        className={buttonClass('danger', 'sm')}
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : (
          <X className="h-3 w-3" strokeWidth={1.75} aria-hidden />
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
