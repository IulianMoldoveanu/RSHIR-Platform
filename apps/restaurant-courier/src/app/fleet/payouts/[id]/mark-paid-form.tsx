'use client';

import { useState, useTransition } from 'react';
import { markPayoutPeriodPaidAction } from '../actions';

/**
 * Inline form to mark a payout_periods row as PAID. Lives in /[id] (not a
 * dialog) so a manager on a 320-wide phone screen never has to deal with
 * a focus-trapped modal during a quick reconciliation pass.
 */
export function MarkPaidForm({ periodId }: { periodId: string }) {
  const [paidMethod, setPaidMethod] = useState<string>('BANK_TRANSFER');
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.set('period_id', periodId);
    formData.set('paid_method', paidMethod);
    formData.set('payment_ref', paymentRef.trim());
    startTransition(async () => {
      const result = await markPayoutPeriodPaidAction(formData);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="paid_method" className="text-xs font-semibold text-hir-muted-fg">
          Metodă de plată
        </label>
        <select
          id="paid_method"
          name="paid_method"
          value={paidMethod}
          onChange={(e) => setPaidMethod(e.target.value)}
          className="rounded-lg border border-hir-border bg-hir-bg px-2 py-1.5 text-sm text-hir-fg focus:border-violet-500 focus:outline-none"
        >
          <option value="BANK_TRANSFER">Transfer bancar (SEPA)</option>
          <option value="CASH">Cash</option>
          <option value="OTHER">Altă metodă</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="payment_ref" className="text-xs font-semibold text-hir-muted-fg">
          Referință plată (opțional)
        </label>
        <input
          id="payment_ref"
          name="payment_ref"
          type="text"
          value={paymentRef}
          onChange={(e) => setPaymentRef(e.target.value)}
          placeholder="OP nr., număr chitanță, etc."
          maxLength={120}
          className="rounded-lg border border-hir-border bg-hir-bg px-2 py-1.5 text-sm text-hir-fg focus:border-violet-500 focus:outline-none"
        />
      </div>

      {error ? (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"
      >
        {pending ? 'Se salvează…' : 'Confirmă plata'}
      </button>
    </form>
  );
}
