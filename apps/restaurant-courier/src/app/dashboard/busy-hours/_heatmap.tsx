'use client';

import { Fragment, useEffect, useState } from 'react';
import {
  BUSY_HOURS_MATRIX,
  DAY_LABELS_RO_LONG,
  DAY_LABELS_RO_SHORT,
  HOUR_LABELS,
  INTENSITY_LABEL,
  intensityAtDate,
  intensityClass,
  type Intensity,
} from '@/lib/busy-hours';

/**
 * 7-row × 14-col heatmap of typical demand by day-of-week × hour.
 *
 * Highlights the current day-hour with a ring so the courier sees the
 * "we are here now" cell at a glance. Pure presentational — all data is
 * imported from the static fixture in lib/busy-hours.
 */
export function BusyHoursHeatmap() {
  const [now, setNow] = useState<Date | null>(null);

  // Snapshot the time on mount so the ring is stable for the visit, but
  // refresh it once an hour in case the courier leaves the tab open.
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const highlight = now ? intensityAtDate(now) : null;

  return (
    <section className="flex flex-col gap-4">
      <div
        className="overflow-x-auto"
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        <div
          className="grid min-w-[480px] gap-1"
          style={{ gridTemplateColumns: '2.5rem repeat(14, 1fr)' }}
        >
          {/* Header row: empty corner + hour labels */}
          <div aria-hidden />
          {HOUR_LABELS.map((hour) => (
            <div
              key={`h-${hour}`}
              className="text-center text-[10px] font-semibold text-hir-muted-fg"
            >
              {String(hour).padStart(2, '0')}
            </div>
          ))}

          {/* Body rows */}
          {BUSY_HOURS_MATRIX.map((row, dayIdx) => (
            <Fragment key={`row-${dayIdx}`}>
              <div
                className="flex items-center justify-end pr-1 text-[10px] font-semibold text-hir-muted-fg"
                aria-label={DAY_LABELS_RO_LONG[dayIdx]}
              >
                {DAY_LABELS_RO_SHORT[dayIdx]}
              </div>
              {row.map((value, hourIdx) => {
                const isNow =
                  highlight !== null &&
                  highlight.dayIdx === dayIdx &&
                  highlight.hourIdx === hourIdx;
                return (
                  <div
                    key={`c-${dayIdx}-${hourIdx}`}
                    role="img"
                    aria-label={`${DAY_LABELS_RO_LONG[dayIdx]} ${String(
                      HOUR_LABELS[hourIdx],
                    ).padStart(2, '0')}:00 — ${INTENSITY_LABEL[value as Intensity]}`}
                    className={`flex h-8 items-center justify-center rounded-md text-[10px] font-semibold ${intensityClass(
                      value as Intensity,
                    )} ${isNow ? 'ring-2 ring-violet-300' : ''}`}
                  >
                    {isNow ? 'acum' : null}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-hir-muted-fg">
        {[0, 1, 2, 3, 4].map((v) => (
          <span key={v} className="flex items-center gap-1.5">
            <span
              className={`inline-block h-3 w-4 rounded ${intensityClass(v as Intensity)}`}
              aria-hidden
            />
            {INTENSITY_LABEL[v as Intensity]}
          </span>
        ))}
      </div>
    </section>
  );
}
