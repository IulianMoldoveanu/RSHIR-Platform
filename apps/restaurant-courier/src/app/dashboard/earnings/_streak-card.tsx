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
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
        isWarning
          ? 'border-orange-500/30 bg-orange-500/5'
          : 'border-violet-500/30 bg-violet-500/5'
      }`}
    >
      <Flame
        className={`h-5 w-5 shrink-0 ${isWarning ? 'text-orange-400' : 'text-violet-400'}`}
        aria-hidden
      />
      <div className="flex-1 text-sm">
        {isWarning ? (
          <>
            <p className="font-medium text-hir-fg">Seria ta e în pericol!</p>
            <p className="mt-0.5 text-xs text-hir-muted-fg">
              Ai livrat ieri, dar încă nu ai nicio livrare azi. Pornește o tură pentru a o păstra.
            </p>
          </>
        ) : (
          <>
            <p className="font-medium text-hir-fg">
              {streak === 1
                ? 'Prima zi din serie — continuă tot mâine!'
                : `Continuă-ți seria — ${streak} ${streak === 1 ? 'zi' : 'zile'} la rând`}
            </p>
            <p className="mt-0.5 text-xs text-hir-muted-fg">
              Livrezi în fiecare zi. Menține seria activă!
            </p>
          </>
        )}
      </div>
      <span
        className={`text-xl font-bold tabular-nums ${isWarning ? 'text-orange-300' : 'text-violet-300'}`}
        aria-label={`${streak} zile`}
      >
        {streak}
      </span>
    </section>
  );
}
