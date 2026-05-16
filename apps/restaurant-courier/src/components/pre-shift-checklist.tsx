'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronRight, X } from 'lucide-react';
import { Button } from '@hir/ui';

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
    // Short haptic on tick.
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(15); } catch { /* silent */ }
    }
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
    <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-950/40 to-zinc-900 p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-300">
          Verificare pre-tură
        </p>
        <button
          type="button"
          aria-label="Sari peste verificare"
          onClick={handleSkip}
          className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 hover:text-zinc-300"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {ITEMS.map((label, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => toggle(i)}
              className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                checked[i]
                  ? 'border-emerald-600/40 bg-emerald-950/30 text-emerald-300'
                  : 'border-hir-border bg-zinc-900/60 text-zinc-300 hover:border-violet-500/30'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                  checked[i]
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-zinc-600 bg-zinc-800'
                }`}
              >
                {checked[i] ? <Check className="h-3 w-3" aria-hidden /> : null}
              </span>
              {label}
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-col gap-3">
        <button
          type="button"
          onClick={handleContinue}
          className={`flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
            allChecked
              ? 'bg-violet-600 text-white hover:bg-violet-500'
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
          }`}
        >
          {allChecked ? (
            <>
              <Check className="h-4 w-4" aria-hidden />
              Totul pregătit — pornește tura
            </>
          ) : (
            <>
              Continuă oricum
              <ChevronRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>

        <label className="flex min-h-[44px] cursor-pointer items-center gap-2 px-1 text-xs text-zinc-500">
          <input
            type="checkbox"
            checked={neverShow}
            onChange={(e) => setNeverShow(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 accent-violet-500"
          />
          Nu mai arăta această verificare
        </label>
      </div>
    </div>
  );
}
