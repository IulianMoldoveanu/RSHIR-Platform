'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { VehicleIcon, type VehicleType } from './vehicle-icon';

const OPTIONS: Array<{ value: VehicleType; label: string }> = [
  { value: 'BIKE', label: 'Bicicletă' },
  { value: 'SCOOTER', label: 'Scuter' },
  { value: 'CAR', label: 'Mașină' },
];

/**
 * Segmented vehicle picker. Server-rendered radios were the original
 * implementation, but `defaultChecked` froze the visual selection on the
 * server's value — clicking another option didn't update the highlight
 * until the form submitted. This client-driven version flips the highlight
 * the instant the user taps and persists optimistically (a pending
 * indicator shows during the transition; the row reverts on error).
 *
 * The 3D-style miniature illustrations replace the lucide line-art icons
 * we shipped in the first cut — same component the live map uses, so the
 * settings preview is pixel-identical to the marker the courier sees.
 */
export function VehicleSelector({
  initial,
  onSave,
}: {
  initial: VehicleType;
  onSave: (next: VehicleType) => Promise<void>;
}) {
  const [selected, setSelected] = useState<VehicleType>(initial);
  const [committed, setCommitted] = useState<VehicleType>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pick(next: VehicleType) {
    if (next === selected || pending) return;
    setError(null);
    const previous = selected;
    setSelected(next);
    startTransition(async () => {
      try {
        await onSave(next);
        setCommitted(next);
      } catch (e) {
        // Roll back on error so the chip never lies about persisted state.
        setSelected(previous);
        setCommitted(previous);
        setError(e instanceof Error ? e.message : 'Eroare la salvare.');
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Showcase preview — the currently selected vehicle at a glance,
          with a soft radial backdrop so the new 3D paintwork pops. The
          icons are sharp at any size (pure SVG), so we render large here. */}
      <div
        aria-hidden
        className="relative flex h-32 items-center justify-center overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-b from-violet-500/10 via-zinc-950 to-zinc-950"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.35),transparent_60%)]" />
        <VehicleIcon
          type={selected}
          size={96}
          style={{ filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.45))' }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((opt) => {
          const isSelected = selected === opt.value;
          const isCommitted = committed === opt.value;
          return (
            <button
              type="button"
              key={opt.value}
              onClick={() => pick(opt.value)}
              aria-pressed={isSelected}
              className={`relative flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2 ${
                isSelected
                  ? 'border-violet-500/70 bg-violet-500/15 text-violet-100 shadow-lg shadow-violet-500/15'
                  : 'border-hir-border bg-hir-surface text-hir-muted-fg hover:border-violet-500/30 hover:bg-hir-border/50 hover:text-hir-fg'
              }`}
            >
              <VehicleIcon type={opt.value} size={56} />
              <span>{opt.label}</span>
              {isSelected && isCommitted && !pending ? (
                <span
                  aria-hidden
                  className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 text-white shadow-md shadow-violet-500/40"
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              ) : null}
              {isSelected && pending ? (
                <span
                  aria-hidden
                  className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 text-white"
                >
                  <Loader2 className="h-3 w-3 animate-spin" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-hir-muted-fg">
        Vehiculul ales apare ca marker pe hartă.
      </p>
      {error ? <p className="text-[11px] text-rose-400">{error}</p> : null}
    </div>
  );
}
