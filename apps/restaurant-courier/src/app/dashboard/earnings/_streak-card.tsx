import { Flame } from 'lucide-react';

type Props = {
  /** DELIVERED orders from the last 30 days, newest first. */
  rows: Array<{ updated_at: string }>;
};

/**
 * Computes consecutive-day streak ending today (or yesterday-warning state).
 * "Today" and "yesterday" are determined by the date portion of `updated_at`
 * — same convention as the page-level byDay bucketing.
 */
function computeStreak(rows: Props['rows']): {
  streak: number;
  brokenYesterday: boolean;
} {
  if (rows.length === 0) return { streak: 0, brokenYesterday: false };

  // Collect unique delivery dates as YYYY-MM-DD strings.
  const dateSet = new Set<string>();
  for (const row of rows) {
    const d = new Date(row.updated_at);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dateSet.add(`${y}-${m}-${day}`);
  }

  // Walk backwards from today.
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  const isoDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const todayKey = isoDate(todayDate);
  const hasToday = dateSet.has(todayKey);

  // Count gap-free days going backwards from today.
  let streak = 0;
  const cursor = new Date(todayDate);
  while (true) {
    const key = isoDate(cursor);
    if (!dateSet.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  // "Broken yesterday" state: today has no deliveries, but yesterday did.
  const yesterdayDate = new Date(todayDate);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const brokenYesterday = !hasToday && dateSet.has(isoDate(yesterdayDate));

  return { streak, brokenYesterday };
}

export function StreakCard({ rows }: Props) {
  const { streak, brokenYesterday } = computeStreak(rows);

  // Nothing to show if no streak at all and not even yesterday.
  if (streak === 0 && !brokenYesterday) return null;

  const isWarning = brokenYesterday;

  return (
    <section
      aria-label="Seria de livrări"
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ring-1 ring-inset ${
        isWarning
          ? 'border-amber-500/40 bg-amber-500/10 ring-amber-500/15 shadow-sm shadow-amber-500/10'
          : 'border-violet-500/40 bg-violet-500/10 ring-violet-500/15 shadow-sm shadow-violet-500/10'
      }`}
    >
      <span
        aria-hidden
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ${
          isWarning
            ? 'bg-amber-500/20 ring-amber-500/40 shadow-sm shadow-amber-500/20'
            : 'bg-violet-500/20 ring-violet-500/40 shadow-sm shadow-violet-500/20'
        }`}
      >
        <Flame
          className={`h-4 w-4 ${isWarning ? 'text-amber-300' : 'text-violet-300'} ${
            isWarning ? '' : 'drop-shadow-[0_0_4px_rgba(167,139,250,0.5)]'
          }`}
          aria-hidden
          strokeWidth={2.25}
        />
      </span>
      <div className="flex-1 text-sm">
        {isWarning ? (
          <>
            <p className="font-semibold text-amber-100">Seria ta e în pericol!</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-200/90">
              Ai livrat ieri, dar încă nu ai nicio livrare azi. Pornește o tură pentru a o păstra.
            </p>
          </>
        ) : (
          <>
            <p className="font-semibold text-hir-fg">
              {streak === 1
                ? 'Prima zi din serie — continuă tot mâine!'
                : `Continuă-ți seria — ${streak} ${streak === 1 ? 'zi' : 'zile'} la rând`}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-hir-muted-fg">
              Livrezi în fiecare zi. Menține seria activă!
            </p>
          </>
        )}
      </div>
      <span
        className={`text-2xl font-bold tabular-nums leading-none ${isWarning ? 'text-amber-200' : 'text-violet-200'}`}
        aria-label={`${streak} zile`}
      >
        {streak}
      </span>
    </section>
  );
}
