'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import {
  MAX_SLOTS,
  slotKey,
  readSlots,
  writeSlots,
  toggleSlot,
  buildMailtoBody,
} from '@/lib/schedule-slots';
import { select as hapticSelect, toggle as hapticToggle } from '@/lib/haptics';

// Grid covers 8:00–21:00 inclusive (14 slots per day).
const HOURS = Array.from({ length: 14 }, (_, i) => i + 8);
const RO_DAYS_SHORT = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];
const RO_DAYS_LONG = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'];

/** Return midnight of date + offsetDays from today (local time). */
function dayOffset(today: Date, offsetDays: number): Date {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Format Date as DD/MM for column header. */
function fmtDDMM(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

export function ScheduleGrid() {
  const [slots, setSlots] = useState<Set<string>>(new Set());
  const [days, setDays] = useState<Date[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from LocalStorage once mounted (avoid SSR mismatch).
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setDays(Array.from({ length: 7 }, (_, i) => dayOffset(today, i)));
    setSlots(readSlots());
    setHydrated(true);
  }, []);

  // Sync to LocalStorage whenever slots change.
  useEffect(() => {
    if (hydrated) writeSlots(slots);
  }, [slots, hydrated]);

  const handleToggle = useCallback(
    (key: string) => {
      setSlots((prev) => {
        const next = toggleSlot(prev, key);
        if (next.has(key)) hapticToggle();
        else hapticSelect();
        return next;
      });
    },
    [],
  );

  const handleSendToDispatcher = useCallback(() => {
    const body = buildMailtoBody(slots);
    const subject = encodeURIComponent('Rezervare tură HIR Curier');
    const encodedBody = encodeURIComponent(body);
    window.location.href = `mailto:dispecer@hirforyou.ro?subject=${subject}&body=${encodedBody}`;
  }, [slots]);

  const reserved = slots.size;
  const atCap = reserved >= MAX_SLOTS;

  if (!hydrated) {
    // Skeleton to avoid layout shift.
    return (
      <div className="flex flex-col gap-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-hir-border" />
        <div className="h-64 animate-pulse rounded-2xl bg-hir-border" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Counter */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-hir-fg">
          <span
            className={atCap ? 'font-bold text-amber-400' : 'font-bold text-violet-400'}
          >
            {reserved} / {MAX_SLOTS}
          </span>{' '}
          ore rezervate săptămâna asta
        </p>
        {atCap ? (
          <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-400">
            Limită atinsă
          </span>
        ) : null}
      </div>

      {/* Scroll-snapping grid wrapper */}
      <div
        className="overflow-x-auto"
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        <div
          className="grid min-w-[480px]"
          style={{ gridTemplateColumns: '3rem repeat(7, 1fr)' }}
        >
          {/* Header row — empty corner + 7 day labels */}
          <div className="h-12" aria-hidden />
          {days.map((day, di) => {
            const dowIndex = (day.getDay() + 6) % 7; // 0=Mon
            const isToday = di === 0;
            return (
              <div
                key={day.toISOString()}
                className="flex flex-col items-center justify-center pb-2 pt-1"
              >
                <span
                  className={`text-[11px] font-semibold uppercase tracking-wide ${
                    isToday ? 'text-violet-400' : 'text-hir-muted-fg'
                  }`}
                >
                  {RO_DAYS_SHORT[dowIndex]}
                </span>
                <span
                  className={`text-xs font-medium ${
                    isToday ? 'text-violet-300' : 'text-hir-muted-fg'
                  }`}
                >
                  {fmtDDMM(day)}
                </span>
              </div>
            );
          })}

          {/* Hour rows */}
          {HOURS.map((hour) => (
            <Fragment key={`row-${hour}`}>
              {/* Hour label */}
              <div
                className="flex items-center justify-end pr-2 text-[11px] font-medium text-hir-muted-fg"
                style={{ height: '44px' }}
                aria-hidden
              >
                {String(hour).padStart(2, '0')}:00
              </div>

              {/* 7 day cells for this hour */}
              {days.map((day, di) => {
                const key = slotKey(day, hour);
                const isReserved = slots.has(key);
                const dowIndex = (day.getDay() + 6) % 7;
                const isToday = di === 0;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleToggle(key)}
                    disabled={!isReserved && atCap}
                    aria-pressed={isReserved}
                    aria-label={`${RO_DAYS_LONG[dowIndex]} ${fmtDDMM(day)} ${String(hour).padStart(2, '0')}:00 — ${isReserved ? 'rezervat' : 'liber'}`}
                    className={[
                      'relative mx-0.5 my-0.5 flex items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-1',
                      // min tap target 44px
                      'min-h-[44px]',
                      isReserved
                        ? 'bg-violet-600 text-white hover:bg-violet-500'
                        : isToday && !atCap
                          ? 'bg-violet-500/10 text-hir-muted-fg hover:bg-violet-500/20'
                          : atCap
                            ? 'cursor-not-allowed bg-hir-surface text-hir-muted-fg/40'
                            : 'bg-hir-surface text-hir-muted-fg hover:bg-hir-border',
                    ].join(' ')}
                  >
                    {isReserved ? (
                      <span className="text-[11px] font-bold text-white" aria-hidden>
                        OK
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-hir-muted-fg">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-violet-600" aria-hidden />
          Rezervat
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-hir-border bg-hir-surface" aria-hidden />
          Liber
        </span>
        <span className="text-hir-muted-fg/70">Apasă o celulă pentru a rezerva / anula.</span>
      </div>

      {/* Trimite la dispecer */}
      <button
        type="button"
        onClick={handleSendToDispatcher}
        disabled={reserved === 0}
        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 text-sm font-semibold text-white hover:bg-violet-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Send className="h-4 w-4" aria-hidden />
        Trimite la dispecer
      </button>

      {reserved === 0 ? (
        <p className="text-center text-xs text-hir-muted-fg">
          Rezervă cel puțin o oră pentru a putea trimite.
        </p>
      ) : (
        <p className="text-center text-xs text-hir-muted-fg">
          Se va deschide aplicația de e-mail cu sloturile selectate.
        </p>
      )}
    </div>
  );
}
