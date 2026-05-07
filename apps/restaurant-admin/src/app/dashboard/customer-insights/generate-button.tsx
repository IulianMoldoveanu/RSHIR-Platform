'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Sparkles } from 'lucide-react';
import { generateOrGetWeeklyDigest } from './actions';

export function GenerateButton({
  tenantId,
  hasDigest,
}: {
  tenantId: string;
  hasDigest: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(forceRefresh: boolean) {
    setError(null);
    start(async () => {
      try {
        await generateOrGetWeeklyDigest({ tenantId, forceRefresh });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Eroare la generare.');
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => run(hasDigest)}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
      >
        {hasDigest ? (
          <RefreshCw className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`} />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        {pending ? 'Hepy analizează…' : hasDigest ? 'Reîmprospătează' : 'Generează sumar'}
      </button>
      {error ? <span className="text-[11px] text-rose-600">{error}</span> : null}
    </span>
  );
}
