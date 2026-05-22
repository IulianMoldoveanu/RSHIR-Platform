'use client';

// Migrated 2026-05-22 from mailto+localStorage to DB-backed slots (see PR #716)

import { Fragment, useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react';
import { toast } from '@hir/ui';
import { select as hapticSelect, toggle as hapticToggle } from '@/lib/haptics';
import type { ShiftSlot } from './actions';
import { createShiftSlot, requestSlotChange, cancelSlot } from './actions';

// Grid covers 08:00–21:00 (14 hour-cells per day).
const HOURS = Array.from({ length: 14 }, (_, i) => i + 8);
const RO_DAYS_SHORT = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];
const RO_DAYS_LONG = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'];

// ── Date helpers ─────────────────────────────────────────────────────────────

function fmtDDMM(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

/** ISO Monday 00:00:00 UTC for the week offset by `deltaDays` (±7). */
function shiftWeek(weekStart: string, deltaDays: number): string {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString();
}

/** Array of 7 UTC midnight Date objects starting at weekStart. */
function weekDays(weekStart: string): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });
}

/** Build the ISO slot_start / slot_end strings for a given day+hour (UTC). */
function slotRange(day: Date, hour: number): { start: string; end: string } {
  const start = new Date(day);
  start.setUTCHours(hour, 0, 0, 0);
  const end = new Date(day);
  end.setUTCHours(hour + 1, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

// ── Slot lookup helpers ───────────────────────────────────────────────────────

/** Find the first slot that covers the given day+hour cell. */
function findSlot(slots: ShiftSlot[], day: Date, hour: number): ShiftSlot | undefined {
  const { start } = slotRange(day, hour);
  return slots.find((s) => s.slot_start === start);
}

/** True if a slot was CANCELLED within the last 24h (show ghost). */
function isFreshCancel(slot: ShiftSlot): boolean {
  if (slot.status !== 'CANCELLED') return false;
  return Date.now() - new Date(slot.updated_at).getTime() < 24 * 60 * 60 * 1000;
}

// ── Modal types ───────────────────────────────────────────────────────────────

type ModalState =
  | { kind: 'confirm-create'; day: Date; hour: number }
  | { kind: 'active-actions'; slot: ShiftSlot; day: Date; hour: number }
  | { kind: 'request-change'; slot: ShiftSlot; day: Date; hour: number };

// ── Props ─────────────────────────────────────────────────────────────────────

interface ScheduleGridProps {
  initialSlots: ShiftSlot[];
  weekStart: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ScheduleGrid({ initialSlots, weekStart }: ScheduleGridProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modal, setModal] = useState<ModalState | null>(null);
  // changeHour tracks the new hour selected in the "request-change" modal.
  const [changeHour, setChangeHour] = useState<number>(8);

  const days = weekDays(weekStart);

  // ── Week navigation ─────────────────────────────────────────────────────────
  const todayUtcMidnight = new Date();
  todayUtcMidnight.setUTCHours(0, 0, 0, 0);
  const MIN_WEEK_START = new Date(todayUtcMidnight);
  MIN_WEEK_START.setUTCDate(MIN_WEEK_START.getUTCDate() - 30);

  const prevWeek = shiftWeek(weekStart, -7);
  const nextWeek = shiftWeek(weekStart, 7);
  const isPrevDisabled = new Date(prevWeek) < MIN_WEEK_START;

  const navigate = useCallback(
    (week: string) => {
      router.push(`/dashboard/schedule?week=${encodeURIComponent(week)}`);
    },
    [router],
  );

  // ── Cell click ──────────────────────────────────────────────────────────────
  const handleCellClick = useCallback(
    (day: Date, hour: number) => {
      const slot = findSlot(initialSlots, day, hour);
      if (!slot || isFreshCancel(slot)) {
        // Empty or recently cancelled — offer to create.
        hapticSelect();
        setModal({ kind: 'confirm-create', day, hour });
      } else if (slot.status === 'ACTIVE' || slot.status === 'REQUESTED') {
        hapticToggle();
        setModal({ kind: 'active-actions', slot, day, hour });
      }
      // REQUESTED_CHANGE / SUPERSEDED / REJECTED → no action (disabled).
    },
    [initialSlots],
  );

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleCreate = useCallback(
    (day: Date, hour: number) => {
      const { start, end } = slotRange(day, hour);
      setModal(null);
      startTransition(async () => {
        try {
          await createShiftSlot(start, end);
          hapticToggle();
          toast.success('Tură adăugată.');
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message ?? 'Eroare la salvare.');
        }
      });
    },
    [router],
  );

  const handleCancel = useCallback(
    (slotId: string) => {
      setModal(null);
      startTransition(async () => {
        try {
          await cancelSlot(slotId);
          hapticSelect();
          toast.success('Tură anulată.');
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message ?? 'Eroare la anulare.');
        }
      });
    },
    [router],
  );

  const handleRequestChange = useCallback(
    (slot: ShiftSlot, day: Date, newHour: number) => {
      const { start: newStart, end: newEnd } = slotRange(day, newHour);
      const reason = `Modificare orar: ${String(newHour).padStart(2, '0')}:00–${String(newHour + 1).padStart(2, '0')}:00`;
      setModal(null);
      startTransition(async () => {
        try {
          await requestSlotChange(slot.id, newStart, newEnd, reason);
          hapticToggle();
          toast.success('Cerere de modificare trimisă. Dispecerul va confirma.');
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message ?? 'Eroare la modificare.');
        }
      });
    },
    [router],
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  const activeCount = initialSlots.filter(
    (s) => s.status === 'ACTIVE' || s.status === 'REQUESTED',
  ).length;

  return (
    <div className={`flex flex-col gap-5 ${isPending ? 'pointer-events-none opacity-70' : ''}`}>
      {/* Empty state */}
      {initialSlots.length === 0 && (
        <p className="rounded-2xl border border-dashed border-hir-border px-4 py-6 text-center text-sm text-hir-muted-fg">
          Marchează orele când vrei să livrezi. Dispecerul vede direct ce ai selectat.
        </p>
      )}

      {/* Active slot counter */}
      {activeCount > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-hir-border bg-hir-surface px-4 py-3">
          <p className="text-sm font-medium text-hir-fg">
            <span className="tabular-nums font-bold text-violet-300">{activeCount}</span>
            <span className="text-hir-muted-fg"> ture active săptămâna asta</span>
          </p>
        </div>
      )}

      {/* Week navigation */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={isPrevDisabled}
          onClick={() => navigate(prevWeek)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-hir-border bg-hir-surface text-hir-muted-fg transition hover:bg-hir-border disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Săptămâna anterioară"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-hir-fg">
          {fmtDDMM(days[0])} – {fmtDDMM(days[6])}
        </span>
        <button
          type="button"
          onClick={() => navigate(nextWeek)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-hir-border bg-hir-surface text-hir-muted-fg transition hover:bg-hir-border"
          aria-label="Săptămâna următoare"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Grid */}
      <div
        className="overflow-x-auto"
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        <div
          className="grid min-w-[480px]"
          style={{ gridTemplateColumns: '3rem repeat(7, 1fr)' }}
        >
          {/* Header row */}
          <div className="h-12" aria-hidden />
          {days.map((day) => {
            const dowIndex = (day.getUTCDay() + 6) % 7; // 0=Mon
            const isToday =
              day.toISOString().slice(0, 10) ===
              todayUtcMidnight.toISOString().slice(0, 10);
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
              <div
                className="flex items-center justify-end pr-2 text-[11px] font-medium text-hir-muted-fg"
                style={{ height: '44px' }}
                aria-hidden
              >
                {String(hour).padStart(2, '0')}:00
              </div>

              {days.map((day) => {
                const dowIndex = (day.getUTCDay() + 6) % 7;
                const slot = findSlot(initialSlots, day, hour);
                const freshCancel = slot ? isFreshCancel(slot) : false;
                const status = slot?.status;

                const isActive = status === 'ACTIVE' || status === 'REQUESTED';
                const isChangeRequested = status === 'REQUESTED_CHANGE';
                const isCancelled = freshCancel;
                const isDisabled =
                  isChangeRequested ||
                  (status === 'SUPERSEDED') ||
                  (status === 'REJECTED') ||
                  (!!slot && !isActive && !freshCancel);

                let cellClass =
                  'relative mx-0.5 my-0.5 flex items-center justify-center rounded-lg transition-all active:scale-[0.94] focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-1 min-h-[44px]';

                if (isActive) {
                  cellClass += ' bg-green-600 text-white shadow-md shadow-green-600/30 hover:bg-green-500';
                } else if (isChangeRequested) {
                  cellClass += ' bg-amber-500/20 text-amber-300 cursor-not-allowed';
                } else if (isCancelled) {
                  cellClass += ' bg-hir-surface text-hir-muted-fg/50';
                } else if (isDisabled) {
                  cellClass += ' bg-hir-surface text-hir-muted-fg/30 cursor-not-allowed';
                } else {
                  cellClass += ' bg-hir-surface text-hir-muted-fg hover:bg-hir-border';
                }

                return (
                  <button
                    key={`${day.toISOString()}-${hour}`}
                    type="button"
                    onClick={() => handleCellClick(day, hour)}
                    disabled={isDisabled && !freshCancel}
                    aria-pressed={isActive}
                    aria-label={`${RO_DAYS_LONG[dowIndex]} ${fmtDDMM(day)} ${String(hour).padStart(2, '0')}:00`}
                    className={cellClass}
                  >
                    {isActive && (
                      <Check className="h-4 w-4 text-white" aria-hidden strokeWidth={3} />
                    )}
                    {isChangeRequested && (
                      <Clock className="h-3.5 w-3.5 text-amber-300" aria-hidden />
                    )}
                    {isCancelled && !isChangeRequested && (
                      <span
                        className="absolute inset-x-1 bottom-[6px] border-b border-dashed border-hir-muted-fg/40"
                        aria-hidden
                      />
                    )}
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
          <span className="inline-block h-3 w-3 rounded bg-green-600" aria-hidden />
          Activ
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-amber-500/25 ring-1 ring-amber-400/40" aria-hidden />
          Modificare în așteptare
        </span>
        <span className="flex items-center gap-1.5">
          <span className="relative inline-block h-3 w-3 rounded border border-dashed border-hir-muted-fg/50" aria-hidden />
          Anulat (24h)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-hir-border bg-hir-surface" aria-hidden />
          Liber
        </span>
      </div>

      {/* ── Modals ── */}
      {modal?.kind === 'confirm-create' && (
        <Modal onClose={() => setModal(null)}>
          <p className="text-sm font-semibold text-hir-fg">
            Marchezi disponibilitatea?
          </p>
          <p className="mt-1 text-sm text-hir-muted-fg">
            {RO_DAYS_LONG[(modal.day.getUTCDay() + 6) % 7]}{' '}
            {fmtDDMM(modal.day)}{' '}
            {String(modal.hour).padStart(2, '0')}:00 –{' '}
            {String(modal.hour + 1).padStart(2, '0')}:00
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => setModal(null)}
              className="flex-1 rounded-xl border border-hir-border bg-hir-surface px-4 py-2.5 text-sm font-medium text-hir-muted-fg hover:bg-hir-border"
            >
              Renunț
            </button>
            <button
              type="button"
              onClick={() => handleCreate(modal.day, modal.hour)}
              className="flex-1 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-500"
            >
              Da, marchează
            </button>
          </div>
        </Modal>
      )}

      {modal?.kind === 'active-actions' && (
        <Modal onClose={() => setModal(null)}>
          <p className="text-sm font-semibold text-hir-fg">
            {RO_DAYS_LONG[(modal.day.getUTCDay() + 6) % 7]}{' '}
            {fmtDDMM(modal.day)}{' '}
            {String(modal.hour).padStart(2, '0')}:00–{String(modal.hour + 1).padStart(2, '0')}:00
          </p>
          <p className="mt-1 text-xs text-hir-muted-fg">Tură activă — ce vrei să faci?</p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                setChangeHour(modal.hour);
                setModal({ kind: 'request-change', slot: modal.slot, day: modal.day, hour: modal.hour });
              }}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-hir-border bg-hir-surface px-4 text-sm font-medium text-hir-fg hover:bg-hir-border"
            >
              <Clock className="h-4 w-4" aria-hidden />
              Cere modificare orar
            </button>
            <button
              type="button"
              onClick={() => handleCancel(modal.slot.id)}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 text-sm font-semibold text-red-400 hover:bg-red-500/20"
            >
              <X className="h-4 w-4" aria-hidden />
              Anulează tura
            </button>
            <button
              type="button"
              onClick={() => setModal(null)}
              className="min-h-[44px] rounded-xl border border-hir-border bg-hir-surface px-4 text-sm text-hir-muted-fg hover:bg-hir-border"
            >
              Înapoi
            </button>
          </div>
        </Modal>
      )}

      {modal?.kind === 'request-change' && (
        <Modal onClose={() => setModal(null)}>
          <p className="text-sm font-semibold text-hir-fg">Cere modificare orar</p>
          <p className="mt-1 text-xs text-hir-muted-fg">
            Ora curentă: {String(modal.hour).padStart(2, '0')}:00–{String(modal.hour + 1).padStart(2, '0')}:00.
            Modificarea trece prin dispecer înainte să fie activată.
          </p>
          <div className="mt-3">
            <label className="text-xs text-hir-muted-fg" htmlFor="new-hour-select">
              Oră nouă
            </label>
            <select
              id="new-hour-select"
              value={changeHour}
              onChange={(e) => setChangeHour(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-hir-border bg-hir-surface px-3 py-2.5 text-sm text-hir-fg focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              {HOURS.map((h) => (
                <option key={h} value={h} disabled={h === modal.hour}>
                  {String(h).padStart(2, '0')}:00 – {String(h + 1).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => setModal({ kind: 'active-actions', slot: modal.slot, day: modal.day, hour: modal.hour })}
              className="flex-1 rounded-xl border border-hir-border bg-hir-surface px-4 py-2.5 text-sm font-medium text-hir-muted-fg hover:bg-hir-border"
            >
              Înapoi
            </button>
            <button
              type="button"
              disabled={changeHour === modal.hour}
              onClick={() => handleRequestChange(modal.slot, modal.day, changeHour)}
              className="flex-1 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Trimite cerere
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Inline modal shell ────────────────────────────────────────────────────────

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-safe"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal
    >
      <div className="w-full max-w-md rounded-t-2xl bg-hir-bg p-5 shadow-2xl">
        {children}
      </div>
    </div>
  );
}
