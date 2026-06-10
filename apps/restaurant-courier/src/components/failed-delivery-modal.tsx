'use client';

import { useState, useTransition } from 'react';
import { PackageX } from 'lucide-react';
import { Button, toast } from '@hir/ui';
import * as haptics from '@/lib/haptics';

// Reasons a courier reports when a delivery can't be completed at the door.
// MUST match COURIER_FAILED_REASONS in dashboard/actions.ts (server validates).
const REASONS = [
  'Clientul nu răspunde / e absent',
  'Clientul refuză comanda',
  'Adresa este greșită',
  'Clientul refuză plata',
  'Altă cauză',
] as const;

type Reason = (typeof REASONS)[number];

type Props = {
  /**
   * Server action bound to the order id:
   *   markFailedByCourierAction.bind(null, orderId)
   * Returns `{ ok: true }` or `{ ok: false; error: string }`.
   */
  failAction: (reason: string, notes?: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

/**
 * Delivery-leg escape hatch: lets a courier mark a delivery FAILED when the
 * client is absent/refuses/can't pay/the address is wrong — instead of being
 * hard-stuck at the door (cancel is blocked past PICKED_UP, and faking a
 * delivery corrupts settlement). Two-step (pick reason → confirm) to prevent
 * accidental taps. Amber/warning tone, distinct from the rose cancel modal.
 */
export function FailedDeliveryModal({ failAction }: Props) {
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
    if (!isPending) setOpen(false);
  }
  function handleConfirm() {
    if (!reason || isPending) return;
    startTransition(async () => {
      const result = await failAction(reason, notes || undefined);
      if (result.ok) {
        haptics.success();
        toast.success('Comandă marcată ca nelivrată. Dispeceratul a fost anunțat.');
      } else {
        haptics.failure();
        toast.error(result.error ?? 'Eroare. Reîncearcă.');
      }
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-300 transition-colors hover:bg-amber-500/15 hover:text-amber-200 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-amber-500 focus-visible:outline-offset-2"
        aria-label="Comanda nu a putut fi livrată"
      >
        <PackageX className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2.25} />
        Comanda nu a putut fi livrată
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pb-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Livrare eșuată"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div className="w-full max-w-xl rounded-2xl border border-amber-500/30 bg-zinc-900 p-5 shadow-2xl shadow-amber-900/30">
            <div className="mb-3 flex items-center gap-2.5">
              <span
                aria-hidden
                className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/40"
              >
                <PackageX className="h-5 w-5 text-amber-300" strokeWidth={2.25} />
              </span>
              <h2 className="text-lg font-semibold tracking-tight text-hir-fg">
                {step === 'pick' ? 'Livrare eșuată' : 'Confirmă'}
              </h2>
            </div>

            {step === 'pick' ? (
              <>
                <p className="mb-4 text-sm leading-relaxed text-hir-muted-fg">
                  De ce nu a putut fi livrată comanda?
                </p>
                <fieldset className="space-y-2">
                  <legend className="sr-only">Motiv</legend>
                  {REASONS.map((r) => (
                    <label
                      key={r}
                      className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-amber-500 has-[:focus-visible]:outline-offset-2 ${
                        reason === r
                          ? 'border-amber-500/60 bg-amber-500/10 text-amber-100 shadow-md shadow-amber-500/15'
                          : 'border-hir-border bg-hir-surface text-hir-fg hover:border-amber-500/30 hover:bg-amber-500/5'
                      }`}
                    >
                      <input
                        type="radio"
                        name="failed-reason"
                        value={r}
                        checked={reason === r}
                        onChange={() => {
                          setReason(r);
                          if (r !== 'Altă cauză') setNotes('');
                        }}
                        className="h-4 w-4 shrink-0 accent-amber-500"
                      />
                      {r}
                    </label>
                  ))}
                </fieldset>
                {reason === 'Altă cauză' ? (
                  <textarea
                    className="mt-3 w-full resize-none rounded-xl border border-hir-border bg-hir-surface px-4 py-3 text-sm leading-relaxed text-hir-fg placeholder:text-hir-muted-fg/70 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    placeholder="Descrie pe scurt (opțional)…"
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
                    className="min-h-[48px] flex-1 rounded-xl border border-hir-border text-sm text-hir-muted-fg hover:border-hir-muted-fg/50 hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
                  >
                    Renunță
                  </Button>
                  <button
                    type="button"
                    disabled={!reason}
                    onClick={() => {
                      haptics.warning();
                      setStep('confirm');
                    }}
                    className="min-h-[48px] flex-1 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-600/30 transition-all hover:-translate-y-px hover:bg-amber-500 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-amber-400 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:translate-y-0"
                  >
                    Continuă
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mb-3 text-sm leading-relaxed text-hir-muted-fg">
                  Comanda va fi marcată ca <span className="font-medium text-amber-200">nelivrată</span> și dispeceratul anunțat.
                </p>
                <p className="mb-4 rounded-xl border border-hir-border bg-hir-surface px-4 py-3 text-sm leading-relaxed text-hir-fg">
                  <span className="text-hir-muted-fg">Motiv: </span>
                  <span className="font-medium">{reason}</span>
                  {notes ? <span className="text-hir-muted-fg"> — {notes}</span> : ''}
                </p>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep('pick')}
                    disabled={isPending}
                    className="min-h-[48px] flex-1 rounded-xl border border-hir-border text-sm text-hir-muted-fg hover:border-hir-muted-fg/50 hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
                  >
                    Înapoi
                  </Button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleConfirm}
                    className="min-h-[48px] flex-1 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-600/30 transition-all hover:-translate-y-px hover:bg-amber-500 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-amber-400 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0"
                  >
                    {isPending ? 'Se trimite…' : 'Confirmă'}
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
