'use client';

import { useState, useTransition } from 'react';
import { Loader2, Wand2 } from 'lucide-react';
import { bulkAutoAssignAction } from '../actions';

/**
 * Single-tap "auto-assign all unassigned orders" button. Fires the
 * server-side bulkAutoAssignAction which loops up to 50 orders through
 * the standard auto-assign heuristic. Result toast surfaces both the
 * assigned and skipped counts so the manager knows whether the queue
 * is fully drained or some orders couldn't find a rider.
 */
export function BulkAutoAssignButton({ openCount }: { openCount: number }) {
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Codex P1 #182: do NOT disable based on `openCount`. The dispatch
  // board list is paginated (limit 60) and a hidden tail of unassigned
  // orders beyond the cap would leave this button greyed out even
  // when bulk assign would still have work to do. The server's
  // `bulkAutoAssignAction` selects its own 50-row window of fresh open
  // orders and reports `0/0` when there's truly nothing to do; that's
  // the authoritative gate.
  const disabled = pending;

  function handleClick() {
    setError(null);
    setToast(null);
    start(async () => {
      const r = await bulkAutoAssignAction();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const a = r.assigned ?? 0;
      const s = r.skipped ?? 0;
      if (a === 0 && s === 0) {
        setToast('Nicio comandă de asignat.');
      } else if (s === 0) {
        setToast(`${a} ${a === 1 ? 'comandă asignată' : 'comenzi asignate'}.`);
      } else {
        setToast(`${a} asignate · ${s} sărite (fără curier disponibil).`);
      }
      window.setTimeout(() => setToast(null), 4500);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-xl bg-violet-500 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-400 disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Wand2 className="h-3.5 w-3.5" aria-hidden />
        )}
        Auto-asignează tot{openCount > 0 ? ` (${openCount})` : ''}
      </button>
      {toast ? (
        <span className="text-[11px] font-medium text-emerald-300">{toast}</span>
      ) : null}
      {error ? <span className="text-[11px] text-red-400">{error}</span> : null}
    </div>
  );
}
