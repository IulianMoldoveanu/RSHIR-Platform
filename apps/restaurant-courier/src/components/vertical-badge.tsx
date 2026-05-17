import { Pill, UtensilsCrossed } from 'lucide-react';

/**
 * Tiny pill badge that indicates which vertical an order belongs to.
 * Restaurant: neutral zinc tint with UtensilsCrossed icon.
 * Pharma: emerald tint with Pill icon (medical association).
 *
 * Server component — no 'use client' needed.
 *
 * Icons replace the previous emoji glyphs (💊 / 🍕) which rendered
 * inconsistently across Android vs iOS vs desktop browsers (font
 * fallback varied) and didn't share strokeWidth with the rest of the
 * polish-wave lucide vocabulary. The text label stays unchanged.
 */
export function VerticalBadge({ vertical }: { vertical: 'restaurant' | 'pharma' }) {
  if (vertical === 'pharma') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-200 ring-1 ring-inset ring-emerald-500/20">
        <Pill className="h-3 w-3" aria-hidden strokeWidth={2.25} />
        Farmacie
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-300 ring-1 ring-inset ring-zinc-700/60">
      <UtensilsCrossed className="h-3 w-3" aria-hidden strokeWidth={2.25} />
      Restaurant
    </span>
  );
}
