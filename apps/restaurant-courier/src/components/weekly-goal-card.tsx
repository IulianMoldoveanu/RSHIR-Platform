'use client';

import { useEffect, useState } from 'react';
import { CalendarRange, Pencil } from 'lucide-react';
import { Button } from '@hir/ui';
import {
  DEFAULT_WEEKLY_GOAL_RON,
  MAX_WEEKLY_GOAL_RON,
  MIN_WEEKLY_GOAL_RON,
  clampWeeklyGoal,
  computeProgress,
  readWeeklyGoal,
  writeWeeklyGoal,
} from '@/lib/daily-goal';

/**
 * Weekly earnings goal — Monday→Sunday window. Companion to DailyGoalCard.
 *
 * Server passes `weekEarnings` (gross RON since Monday 00:00); the card
 * stays client-only for the editable goal value.
 *
 * Hidden when weekEarnings is 0 so a fresh week starts quiet.
 */
export function WeeklyGoalCard({ weekEarnings }: { weekEarnings: number }) {
  const [goal, setGoal] = useState(DEFAULT_WEEKLY_GOAL_RON);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(DEFAULT_WEEKLY_GOAL_RON));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const g = readWeeklyGoal();
    setGoal(g);
    setDraft(String(g));
    setHydrated(true);
  }, []);

  function save() {
    const next = clampWeeklyGoal(Number(draft));
    setGoal(next);
    setDraft(String(next));
    writeWeeklyGoal(next);
    setEditing(false);
  }
  function cancel() {
    setDraft(String(goal));
    setEditing(false);
  }

  if (!hydrated || weekEarnings <= 0) return null;

  const { progressPct, reached, delta } = computeProgress(weekEarnings, goal);
  const barColor = reached
    ? 'bg-emerald-500'
    : progressPct >= 75
      ? 'bg-violet-400'
      : 'bg-violet-500';

  return (
    <section
      aria-label="Țintă săptămânală"
      className="flex flex-col gap-3 rounded-2xl border border-hir-border bg-hir-surface p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-hir-muted-fg">
          <CalendarRange className="h-3.5 w-3.5 text-violet-400" aria-hidden />
          Țintă săptămânală
        </p>
        {!editing ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            className="-mr-2 text-hir-muted-fg hover:text-hir-fg"
            aria-label="Modifică ținta săptămânală"
          >
            <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden />
            Modifică
          </Button>
        ) : null}
      </header>

      {editing ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={MIN_WEEKLY_GOAL_RON}
              max={MAX_WEEKLY_GOAL_RON}
              step={50}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[44px] w-32 rounded-lg border border-hir-border bg-hir-bg px-3 text-sm text-hir-fg focus-visible:border-violet-500 focus-visible:outline-none"
            />
            <span className="text-sm text-hir-muted-fg">RON</span>
            <Button onClick={save} size="sm" className="ml-auto">
              Salvează
            </Button>
            <Button onClick={cancel} variant="outline" size="sm">
              Anulează
            </Button>
          </div>
          <p className="text-[11px] text-hir-muted-fg">
            Valori între {MIN_WEEKLY_GOAL_RON} și {MAX_WEEKLY_GOAL_RON} RON.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm tabular-nums text-hir-fg">
              <span className="font-bold">{weekEarnings.toFixed(2)}</span>
              <span className="text-hir-muted-fg"> / {goal} RON</span>
            </p>
            <p
              className={`text-xs font-semibold tabular-nums ${reached ? 'text-emerald-300' : 'text-hir-muted-fg'}`}
            >
              {reached ? 'Țintă atinsă! 🎯' : `mai sunt ${Math.abs(delta).toFixed(2)} RON`}
            </p>
          </div>

          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={Math.min(weekEarnings, goal)}
            aria-label="Progres față de ținta săptămânală"
            className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-800"
          >
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {!reached ? (
            <p className="text-[11px] text-hir-muted-fg">
              Săptămâna se închide duminică seara — Luni resetăm calculul.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
