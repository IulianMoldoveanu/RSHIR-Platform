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
      className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3"
    >
      <Trophy className="h-5 w-5 shrink-0 text-amber-400" aria-hidden />
      <div className="flex-1 text-sm">
        <p className="font-medium text-hir-fg">Cea mai bună zi din lună</p>
        <p className="mt-0.5 text-xs text-hir-muted-fg">
          {label}: {bestDay.earnings.toFixed(2)} RON din{' '}
          {bestDay.count} {bestDay.count === 1 ? 'livrare' : 'livrări'}
        </p>
      </div>
    </section>
  );
}
