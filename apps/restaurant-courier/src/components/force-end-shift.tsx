'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@hir/ui';

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
        className="w-full gap-2 rounded-xl border border-rose-700/40 bg-rose-950/40 px-3 py-2.5 text-sm font-semibold text-rose-200 transition-all hover:-translate-y-px hover:border-rose-500/60 hover:bg-rose-950/60 hover:shadow-md hover:shadow-rose-500/15 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-rose-500 focus-visible:outline-offset-2"
      >
        <AlertTriangle className="h-4 w-4" aria-hidden strokeWidth={2.25} />
        Închide tura forțat
      </Button>

      <Sheet open={open} onOpenChange={(v) => { if (!v) close(); }}>
        <SheetContent side="bottom" className="bg-hir-surface border-hir-border text-hir-fg">
          <SheetHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-500/15 ring-1 ring-rose-500/40 shadow-md shadow-rose-500/15">
                <AlertTriangle className="h-4 w-4 text-rose-300" aria-hidden strokeWidth={2.25} />
              </span>
              <SheetTitle className="text-hir-fg">Închide tura forțat</SheetTitle>
            </div>
            <SheetDescription className="text-hir-muted-fg leading-relaxed">
              Asta anulează cele <strong className="text-hir-fg">{activeOrderCount}</strong>{' '}
              {activeOrderCount === 1 ? 'comandă activă' : 'comenzi active'} și
              închide tura. Folosește doar dacă livrările NU mai pot fi finalizate.
              Acțiunea e logată — abuzul afectează contul tău.
            </SheetDescription>
          </SheetHeader>

          <div className="px-5 pb-2">
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
                Motiv
              </legend>
              {PRESET_REASONS.map((r) => (
                <label
                  key={r}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition-all has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-rose-500 has-[:focus-visible]:outline-offset-2 ${
                    reason === r
                      ? 'border-rose-500/60 bg-rose-500/10 text-rose-100 shadow-sm shadow-rose-500/15 ring-1 ring-inset ring-rose-500/20'
                      : 'border-hir-border bg-hir-bg text-hir-fg hover:border-rose-500/30 hover:bg-rose-500/5'
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
              <label className="mt-1 text-[11px] text-hir-muted-fg">
                Sau detaliază (opțional):
              </label>
              <textarea
                value={PRESET_REASONS.includes(reason) ? '' : reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Scrie motivul..."
                className="w-full resize-none rounded-lg border border-hir-border bg-hir-bg px-2.5 py-2 text-xs leading-relaxed text-hir-fg placeholder:text-hir-muted-fg/70 transition-colors focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              />
            </fieldset>

            {error ? (
              <p className="mt-2 text-xs font-medium text-rose-300">{error}</p>
            ) : null}
          </div>

          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={pending}
              className="flex-1 rounded-xl border-hir-border bg-hir-bg px-3 py-2 text-sm text-hir-muted-fg transition-colors hover:border-hir-muted-fg/40 hover:bg-hir-surface hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
            >
              Renunță
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={submit}
              disabled={pending || reason.trim().length < 3}
              className="flex-1 gap-2 rounded-xl px-3 py-2 text-sm font-semibold shadow-md shadow-rose-600/30 transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-rose-600/40 active:translate-y-0 disabled:shadow-none disabled:hover:translate-y-0"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden strokeWidth={2.25} /> : null}
              Confirmă
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
