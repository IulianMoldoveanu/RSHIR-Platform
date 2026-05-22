// Migrated 2026-05-22 from mailto+localStorage to DB-backed slots (see PR #716)
import { Suspense } from 'react';
import { listMySlots } from './actions';
import { ScheduleGrid } from './_grid';

export const metadata = {
  title: 'Program săptămânal — HIR Curier',
};

/** ISO string of Monday 00:00:00 UTC for the week containing `d`. */
function isoWeekStart(d: Date): string {
  const day = d.getUTCDay(); // 0=Sun
  const diffToMon = (day + 6) % 7; // 0=Mon offset
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() - diffToMon);
  mon.setUTCHours(0, 0, 0, 0);
  return mon.toISOString();
}

async function ScheduleLoader({ weekStart }: { weekStart: string }) {
  let slots;
  try {
    slots = await listMySlots(weekStart);
  } catch {
    slots = [];
  }
  return <ScheduleGrid initialSlots={slots} weekStart={weekStart} />;
}

export default function SchedulePage({
  searchParams,
}: {
  searchParams?: { week?: string };
}) {
  const rawWeek = searchParams?.week;
  // Validate: must be a valid ISO date string, else fall back to current week.
  const weekStart =
    rawWeek && !Number.isNaN(Date.parse(rawWeek))
      ? rawWeek
      : isoWeekStart(new Date());

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-hir-fg">
          Program săptămânal
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-hir-muted-fg">
          Marchează orele când vrei să livrezi. Dispecerul vede direct ce ai selectat.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <div className="h-8 w-48 animate-pulse rounded-lg bg-hir-border" />
            <div className="h-64 animate-pulse rounded-2xl bg-hir-border" />
          </div>
        }
      >
        <ScheduleLoader weekStart={weekStart} />
      </Suspense>
    </div>
  );
}
