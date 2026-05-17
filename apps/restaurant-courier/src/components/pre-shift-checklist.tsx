'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronRight, ClipboardCheck, X } from 'lucide-react';
import { Button } from '@hir/ui';
import { select as hapticSelect } from '@/lib/haptics';

const DISMISS_KEY = 'hir.courier.preShiftChecklistDismissed';
const ITEMS = [
  'Telefonul este peste 50% baterie',
  'Vehiculul este funcțional',
  'Echipament termoizolant (pizza bag) — pregătit',
  'Documente de identitate — asupra mea',
] as const;

type Props = {
  /** Called when the rider taps "Pornește tura" after the checklist. */
  onContinue: () => void;
};

/**
 * Pre-shift checklist shown once before "Start shift". Appears as an
 * overlay card when the rider reaches the shift page and hasn't yet
 * dismissed it permanently.
 *
 * "Nu mai arăta" saves a flag in LocalStorage — subsequent visits skip
 * straight to the swipe button. The checklist NEVER blocks the shift;
 * the courier can skip it at any time via "Sari peste".
 *
 * No server round-trips. No schema changes.
 */
export function PreShiftChecklist({ onContinue }: Props) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [neverShow, setNeverShow] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DISMISS_KEY);
      setDismissed(stored === '1');
    } catch {
      // Private mode — treat as not dismissed, show checklist.
      setDismissed(false);
    }
  }, []);

  function toggle(i: number) {
    setChecked((prev) => ({ ...prev, [i]: !prev[i] }));
    hapticSelect();
  }

  function handleContinue() {
    if (neverShow) {
      try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* silent */ }
    }
    onContinue();
  }

  function handleSkip() {
    onContinue();
  }

  // Null = loading from localStorage, avoid flash.
  if (dismissed === null) return null;
  // Already permanently dismissed — render nothing, parent shows swipe directly.
  if (dismissed) return null;

  const allChecked = ITEMS.every((_, i) => checked[i]);

  return (
    <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-950/50 to-hir-surface p-5 shadow-2xl shadow-black/30 ring-1 ring-inset ring-violet-500/10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/20 ring-1 ring-violet-500/40 shadow-md shadow-violet-500/15"
          >
            <ClipboardCheck className="h-4 w-4 text-violet-200" strokeWidth={2.25} />
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-300">
            Verificare pre-tură
          </p>
        </div>
        <button
          type="button"
          aria-label="Sari peste verificare"
          onClick={handleSkip}
          className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full text-hir-muted-fg transition-colors hover:bg-hir-border/60 hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
        >
          <X className="h-4 w-4" aria-hidden strokeWidth={2.25} />
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {ITEMS.map((label, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => toggle(i)}
              aria-pressed={!!checked[i]}
              className={`flex min-h-[48px] w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-all hover:-translate-y-px active:translate-y-0 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-emerald-500 focus-visible:outline-offset-2 ${
                checked[i]
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100 shadow-md shadow-emerald-500/15 ring-1 ring-inset ring-emerald-500/20'
                  : 'border-hir-border bg-hir-surface text-hir-fg hover:border-emerald-500/40 hover:bg-emerald-500/5'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all ${
                  checked[i]
                    ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-500/40'
                    : 'border-hir-border bg-hir-bg'
                }`}
              >
                {checked[i] ? (
                  <Check className="h-3 w-3" aria-hidden strokeWidth={3} />
                ) : null}
              </span>
              <span className="leading-snug">{label}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-col gap-3">
        <button
          type="button"
          onClick={handleContinue}
          className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-2 ${
            allChecked
              ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/40 ring-1 ring-inset ring-violet-400/30 hover:-translate-y-px hover:bg-violet-500 hover:shadow-xl hover:shadow-violet-600/50 active:translate-y-0'
              : 'border border-hir-border bg-hir-surface text-hir-muted-fg hover:border-hir-muted-fg/40 hover:bg-hir-border/40 hover:text-hir-fg'
          }`}
        >
          {allChecked ? (
            <>
              <Check className="h-4 w-4" aria-hidden strokeWidth={3} />
              Totul pregătit — pornește tura
            </>
          ) : (
            <>
              Continuă oricum
              <ChevronRight className="h-4 w-4" aria-hidden strokeWidth={2.25} />
            </>
          )}
        </button>

        <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg px-1 text-xs text-hir-muted-fg transition-colors hover:text-hir-fg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-violet-500 has-[:focus-visible]:outline-offset-2">
          <input
            type="checkbox"
            checked={neverShow}
            onChange={(e) => setNeverShow(e.target.checked)}
            className="h-4 w-4 rounded border-hir-border bg-hir-bg accent-violet-500"
          />
          Nu mai arăta această verificare
        </label>
      </div>
    </div>
  );
}
