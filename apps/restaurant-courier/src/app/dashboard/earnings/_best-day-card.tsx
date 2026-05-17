import { Trophy } from 'lucide-react';

type Props = {
  bestDay: {
    /** ISO date string YYYY-MM-DD. */
    key: string;
    earnings: number;
    count: number;
  } | null;
};

export function BestDayCard({ bestDay }: Props) {
  // Only show when there's at least 2 deliveries on the best day —
  // same guard as the inline version it replaces.
  if (!bestDay || bestDay.count < 2) return null;

  // dd MMM format in Romanian, e.g. "14 mai".
  // `new Date(key)` with a bare YYYY-MM-DD is parsed as UTC midnight.
  // Adding a mid-day offset keeps us in the correct calendar day regardless
  // of local TZ offset (Bucharest is UTC+2/+3).
  const dateObj = new Date(`${bestDay.key}T12:00:00`);
  const label = dateObj.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });

  return (
    <section
      aria-label="Cea mai bună zi din lună"
      className="flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-amber-500/5 px-4 py-3 shadow-md shadow-amber-500/10 ring-1 ring-inset ring-amber-500/20"
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/40"
      >
        <Trophy className="h-5 w-5 text-amber-200" strokeWidth={2.25} />
      </span>
      <div className="flex-1 text-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">
          Cea mai bună zi din lună
        </p>
        <p className="mt-1 text-sm text-zinc-100">
          <span className="font-medium tabular-nums text-amber-100">{label}</span>
          <span className="text-zinc-400"> · </span>
          <span className="font-semibold tabular-nums">
            {bestDay.earnings.toFixed(2)} RON
          </span>
          <span className="text-zinc-400">
            {' '}
            din <span className="tabular-nums">{bestDay.count}</span>{' '}
            {bestDay.count === 1 ? 'livrare' : 'livrări'}
          </span>
        </p>
      </div>
    </section>
  );
}
