/**
 * Tiny pill badge that indicates which vertical an order belongs to.
 * Restaurant: neutral zinc tint. Pharma: emerald tint (medical association).
 *
 * Server component — no 'use client' needed.
 */
export function VerticalBadge({ vertical }: { vertical: 'restaurant' | 'pharma' }) {
  if (vertical === 'pharma') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
        💊 Farmacie
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
      🍕 Restaurant
    </span>
  );
}
