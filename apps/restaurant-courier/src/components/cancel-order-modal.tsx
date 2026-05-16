'use client';

import { useState, useTransition } from 'react';
import { XCircle } from 'lucide-react';
import { Button } from '@hir/ui';
import { toast } from '@hir/ui';
import * as haptics from '@/lib/haptics';

const REASONS = [
  'Adresa este greșită',
  'Clientul nu răspunde',
  'Restaurant închis',
  'Altă cauză',
] as const;

type Reason = (typeof REASONS)[number];

type Props = {
  /**
   * Server action already bound to the order id:
   *   cancelOrderByCourierAction.bind(null, orderId)
   * Returns `{ ok: true }` or `{ ok: false; error: string }`.
   */
  cancelAction: (
    reason: string,
    notes?: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
};

/**
 * Destructive-action modal for courier-initiated order cancellation.
 * Renders a "Anulează comanda" button. On tap, overlays a confirmation
 * sheet with a reason picker (4 presets) and an optional notes field
 * for "Altă cauză". A second confirmation step prevents accidental taps.
 *
 * Tap-target: all interactive elements are min 44×44 px per mobile UX rules.
 */
export function CancelOrderModal({ cancelAction }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'pick' | 'confirm'>('pick');
  const [reason, setReason] = useState<Reason | null>(null);
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    haptics.tap();
    setStep('pick');
    setReason(null);
    setNotes('');
    setOpen(true);
  }

  function handleClose() {
    if (isPending) return;
    setOpen(false);
  }

  function handleReasonSelect(r: Reason) {
    setReason(r);
    if (r !== 'Altă cauză') setNotes('');
  }

  function handleNext() {
    if (!reason) return;
    haptics.warning();
    setStep('confirm');
  }

  function handleBack() {
    setStep('pick');
  }

  function handleConfirm() {
    if (!reason || isPending) return;
    startTransition(async () => {
      const result = await cancelAction(reason, notes || undefined);
      if (result.ok) {
        haptics.success();
        toast.success('Comanda a fost anulată.');
        setOpen(false);
      } else {
        haptics.failure();
        toast.error(result.error ?? 'Eroare la anulare. Reîncercați.');
        setOpen(false);
      }
    });
  }

  return (
    <>
      {/* Trigger button — minimum 44px height, destructive red-tinted */}
      <button
        type="button"
        onClick={handleOpen}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-red-700/40 bg-red-950/30 px-4 py-3 text-sm font-medium text-red-300 hover:bg-red-950/50 active:bg-red-950/60"
        aria-label="Anulează comanda"
      >
        <XCircle className="h-4 w-4 shrink-0" aria-hidden />
        Anulează comanda
      </button>

      {/* Modal overlay */}
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-6"
          role="dialog"
          aria-modal="true"
          aria-label="Anulare comandă"
          onClick={(e) => {
            // Close on backdrop tap only if not pending
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div className="w-full max-w-xl rounded-2xl border border-hir-border bg-zinc-900 p-5 shadow-xl">
            {step === 'pick' ? (
              <>
                <h2 className="mb-1 text-base font-semibold text-hir-fg">Anulează comanda</h2>
                <p className="mb-4 text-sm text-hir-muted-fg">Selectează motivul anulării:</p>

                <fieldset className="space-y-2">
                  <legend className="sr-only">Motiv anulare</legend>
                  {REASONS.map((r) => (
                    <label
                      key={r}
                      className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
                        reason === r
                          ? 'border-red-500/60 bg-red-950/40 text-red-200'
                          : 'border-hir-border bg-hir-surface text-hir-fg hover:border-red-700/40 hover:bg-red-950/20'
                      }`}
                    >
                      <input
                        type="radio"
                        name="cancel-reason"
                        value={r}
                        checked={reason === r}
                        onChange={() => handleReasonSelect(r)}
                        className="h-4 w-4 shrink-0 accent-red-500"
                      />
                      {r}
                    </label>
                  ))}
                </fieldset>

                {reason === 'Altă cauză' ? (
                  <textarea
                    className="mt-3 w-full rounded-xl border border-hir-border bg-hir-surface px-4 py-3 text-sm text-hir-fg placeholder:text-hir-muted-fg focus:border-red-500/60 focus:outline-none"
                    placeholder="Descrie pe scurt motivul (opțional)…"
                    rows={3}
                    maxLength={300}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                ) : null}

                <div className="mt-4 flex gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleClose}
                    className="flex-1 min-h-[44px] rounded-xl border border-hir-border text-sm text-hir-muted-fg hover:text-hir-fg"
                  >
                    Renunță
                  </Button>
                  <button
                    type="button"
                    disabled={!reason}
                    onClick={handleNext}
                    className="flex-1 min-h-[44px] rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Continuă
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="mb-1 text-base font-semibold text-red-300">Confirmare anulare</h2>
                <p className="mb-2 text-sm text-hir-muted-fg">
                  Ești sigur că dorești să anulezi comanda?
                </p>
                <p className="mb-4 rounded-xl border border-hir-border bg-hir-surface px-4 py-3 text-sm text-hir-fg">
                  <span className="text-hir-muted-fg">Motiv: </span>
                  {reason}
                  {notes ? ` — ${notes}` : ''}
                </p>
                <p className="mb-4 text-xs text-hir-muted-fg">
                  Această acțiune nu poate fi anulată. Comanda va reveni în coada flotei.
                </p>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleBack}
                    disabled={isPending}
                    className="flex-1 min-h-[44px] rounded-xl border border-hir-border text-sm text-hir-muted-fg hover:text-hir-fg"
                  >
                    Înapoi
                  </Button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleConfirm}
                    className="flex-1 min-h-[44px] rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPending ? 'Se anulează…' : 'Da, anulează'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
