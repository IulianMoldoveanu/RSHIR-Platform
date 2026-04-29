'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { setSuggestionStatus } from './actions';
import type { CopilotSuggestion } from '@/lib/ai-ceo/queries';

type Props = {
  tenantId: string;
  canAct: boolean;
  initial: CopilotSuggestion[];
};

const TYPE_LABEL: Record<string, string> = {
  social_post: 'Postare',
  email_campaign: 'Email',
  promo: 'Promoție',
};

function typeLabel(t: string): string {
  return TYPE_LABEL[t] ?? t;
}

export function SuggestionsList({ tenantId, canAct, initial }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);
  const [, start] = useTransition();

  if (items.length === 0) {
    return (
      <p className="mt-3 text-sm text-zinc-700">
        Nu există sugestii încă. Botul generează 3 sugestii în brief-ul de dimineață —
        revino după ce primești prima conversație pe Telegram.
      </p>
    );
  }

  const act = (idx: number, status: 'approved' | 'rejected') => {
    const target = items[idx];
    if (!target) return;
    setError(null);
    setPendingIdx(idx);
    start(async () => {
      const r = await setSuggestionStatus(tenantId, {
        runId: target.runId,
        index: target.index,
        status,
      });
      setPendingIdx(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setItems((prev) => prev.map((s, i) => (i === idx ? { ...s, status } : s)));
      router.refresh();
    });
  };

  return (
    <div className="mt-3 flex flex-col gap-2">
      {items.map((s, idx) => {
        const decided = s.status === 'approved' || s.status === 'rejected';
        return (
          <div
            key={`${s.runId}-${s.index}`}
            className="flex items-start justify-between gap-3 rounded-md border border-purple-100 bg-white px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-purple-700">
                <span className="rounded-full bg-purple-100 px-1.5 py-0.5">
                  {typeLabel(s.type)}
                </span>
                {decided && (
                  <span
                    className={
                      s.status === 'approved'
                        ? 'text-emerald-700'
                        : 'text-rose-700'
                    }
                  >
                    {s.status === 'approved' ? 'Aprobat' : 'Respins'}
                  </span>
                )}
              </p>
              <p className="mt-1 truncate text-sm font-medium text-zinc-900">{s.title}</p>
            </div>
            {canAct && !decided && (
              <div className="flex flex-none gap-1.5">
                <button
                  type="button"
                  onClick={() => act(idx, 'approved')}
                  disabled={pendingIdx !== null}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Check className="h-3 w-3" aria-hidden />
                  Aprobă
                </button>
                <button
                  type="button"
                  onClick={() => act(idx, 'rejected')}
                  disabled={pendingIdx !== null}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  <X className="h-3 w-3" aria-hidden />
                  Respinge
                </button>
              </div>
            )}
          </div>
        );
      })}
      {error && (
        <p className="text-xs text-rose-700">
          {error === 'forbidden'
            ? 'Nu ai permisiune să acționezi sugestii.'
            : error === 'not_found'
              ? 'Sugestia nu mai este disponibilă.'
              : 'A apărut o eroare. Încearcă din nou.'}
        </p>
      )}
      {!canAct && (
        <p className="text-xs text-zinc-500">
          Doar utilizatorii cu rolul <strong>OWNER</strong> pot aproba sugestii.
        </p>
      )}
    </div>
  );
}
