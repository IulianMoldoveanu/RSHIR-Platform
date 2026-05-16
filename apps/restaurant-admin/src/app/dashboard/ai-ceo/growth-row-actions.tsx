'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { approveRecommendation, dismissRecommendation } from './growth-actions';

type Props = {
  recommendationId: string;
  tenantId: string;
};

// Mirrors the pattern in suggestions-list.tsx: two buttons, useTransition for
// the pending state, inline error surface (no toast lib in admin yet — keep
// the message inline so the operator sees exactly which row failed).
export function GrowthRowActions({ recommendationId, tenantId }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [decided, setDecided] = useState<'approved' | 'dismissed' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (decided) {
    return (
      <span
        className={
          decided === 'approved'
            ? 'text-xs font-medium text-emerald-700'
            : 'text-xs font-medium text-zinc-500'
        }
      >
        {decided === 'approved' ? 'Aprobat' : 'Respins'}
      </span>
    );
  }

  const run = (action: 'approve' | 'dismiss') => {
    setError(null);
    start(async () => {
      const r =
        action === 'approve'
          ? await approveRecommendation(recommendationId, tenantId)
          : await dismissRecommendation(recommendationId, tenantId);
      if (!r.ok) {
        setError(
          r.error === 'forbidden'
            ? 'Nu ai permisiune.'
            : r.error === 'not_found'
              ? 'Recomandarea nu mai există.'
              : r.error === 'already_decided'
                ? 'Recomandarea a fost deja procesată.'
                : 'A apărut o eroare. Încearcă din nou.',
        );
        return;
      }
      setDecided(action === 'approve' ? 'approved' : 'dismissed');
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-none gap-1.5">
        <button
          type="button"
          onClick={() => run('approve')}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Check className="h-3 w-3" aria-hidden />
          Aprobă
        </button>
        <button
          type="button"
          onClick={() => run('dismiss')}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          <X className="h-3 w-3" aria-hidden />
          Respinge
        </button>
      </div>
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
