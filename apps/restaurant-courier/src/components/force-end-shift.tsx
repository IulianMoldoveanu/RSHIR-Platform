'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { Button } from '@hir/ui';

const PRESET_REASONS = [
  'Restaurantul nu răspunde / a refuzat comanda',
  'Clientul nu poate fi contactat',
  'Vehicul defect / incident pe traseu',
  'Adresă greșită / nelivrabilă',
];

/**
 * Forced end-shift escape hatch. Surfaces only when the courier has at
 * least one active order — that's when the regular "încheie tura" swipe
 * is hidden (anti-misclick during delivery).
 *
 * Two-step flow:
 *   1. Courier taps "Închide tura forțat" → red modal opens.
 *   2. Picks a reason (or types one) + confirms → server action cancels
 *      every active order and ends the shift.
 *
 * The reason is logged in audit_log per cancelled order so dispatchers
 * can review pattern anomalies (e.g. one courier always cites
 * 'restaurant nu răspunde' — flag for retraining or fraud).
 */
export function ForceEndShift({
  activeOrderCount,
  onForceEnd,
}: {
  activeOrderCount: number;
  onForceEnd: (
    reason: string,
  ) => Promise<{ ok: true; cancelled: number } | { ok: false; error: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (activeOrderCount === 0) return null;

  function close() {
    if (pending) return;
    setOpen(false);
    setReason('');
    setError(null);
  }

  function submit() {
    setError(null);
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setError('Selectează sau scrie un motiv (minim 3 caractere).');
      return;
    }
    startTransition(async () => {
      try {
        const r = await onForceEnd(trimmed);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        // Server action revalidates /dashboard + /dashboard/shift; the
        // page rerenders and this component unmounts. No extra UX needed.
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Eroare necunoscută.');
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full gap-2 rounded-xl border border-rose-700/40 bg-rose-950/40 px-3 py-2.5 text-sm font-medium text-rose-200 hover:border-rose-500/60 hover:bg-rose-950/60"
      >
        <AlertTriangle className="h-4 w-4" aria-hidden />
        Închide tura forțat
      </Button>

      {open ? (
        <div className="fixed inset-0 z-[1500] flex items-end justify-center bg-black/60 px-3 pb-3 backdrop-blur-sm sm:items-center sm:pb-0">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="force-end-title"
            className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500/15 text-rose-300">
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                </span>
                <h2 id="force-end-title" className="text-sm font-semibold text-zinc-100">
                  Închide tura forțat
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={close}
                disabled={pending}
                aria-label="Închide"
                className="h-7 w-7 text-zinc-500 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <p className="mb-3 text-xs text-zinc-400">
              Asta anulează cele <strong>{activeOrderCount}</strong>{' '}
              {activeOrderCount === 1 ? 'comandă activă' : 'comenzi active'} și
              închide tura. Folosește doar dacă livrările NU mai pot fi finalizate.
              Acțiunea e logată — abuzul afectează contul tău.
            </p>

            <fieldset className="mb-3 flex flex-col gap-1.5">
              <legend className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Motiv
              </legend>
              {PRESET_REASONS.map((r) => (
                <label
                  key={r}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition ${
                    reason === r
                      ? 'border-rose-500 bg-rose-950/30 text-rose-100'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    className="sr-only"
                  />
                  <span>{r}</span>
                </label>
              ))}
              <label className="mt-1 text-[11px] text-zinc-500">
                Sau detaliază (opțional):
              </label>
              <textarea
                value={
                  PRESET_REASONS.includes(reason) ? '' : reason
                }
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Scrie motivul..."
                className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-rose-500 focus:outline-none"
              />
            </fieldset>

            {error ? (
              <p className="mb-2 text-xs text-rose-400">{error}</p>
            ) : null}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={close}
                disabled={pending}
                className="flex-1 rounded-xl border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
              >
                Renunță
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={submit}
                disabled={pending || reason.trim().length < 3}
                className="flex-1 gap-2 rounded-xl px-3 py-2 text-sm font-semibold"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Confirmă
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
