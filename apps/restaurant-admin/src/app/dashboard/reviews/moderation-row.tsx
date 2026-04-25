'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toggleReviewHidden } from './actions';

export function ModerationRow({
  reviewId,
  initialHidden,
  tenantId,
}: {
  reviewId: string;
  initialHidden: boolean;
  tenantId: string;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState(initialHidden);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function flip() {
    if (pending) return;
    const next = !hidden;
    setErr(null);
    start(async () => {
      try {
        await toggleReviewHidden(reviewId, next, tenantId);
        setHidden(next);
        router.refresh();
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Eroare necunoscută');
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={flip}
        disabled={pending}
        className={`rounded-md border px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
          hidden
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            : 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100'
        }`}
      >
        {pending ? '…' : hidden ? 'Reafișează' : 'Ascunde'}
      </button>
      {err ? <span className="text-xs text-rose-700">{err}</span> : null}
    </div>
  );
}
