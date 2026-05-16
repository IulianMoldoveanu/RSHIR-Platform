/**
 * LocalStorage-backed daily earnings goal. The courier sets a target (RON)
 * once; the orders page renders a progress bar against today's gross.
 * Persisted as a single number; default 200 RON (reasonable Bucharest /
 * Brașov pickup average for a 6h shift).
 */

export const STORAGE_KEY = 'hir-courier-daily-goal';
export const WEEKLY_STORAGE_KEY = 'hir-courier-weekly-goal';
export const DEFAULT_GOAL_RON = 200;
export const DEFAULT_WEEKLY_GOAL_RON = 1200;
export const MIN_GOAL_RON = 50;
export const MAX_GOAL_RON = 1000;
export const MIN_WEEKLY_GOAL_RON = 200;
export const MAX_WEEKLY_GOAL_RON = 6000;

export function readDailyGoal(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_GOAL_RON;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GOAL_RON;
    const n = Number(raw);
    return clampGoal(n);
  } catch {
    return DEFAULT_GOAL_RON;
  }
}

export function writeDailyGoal(ron: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, String(clampGoal(ron)));
  } catch {
    // ignore
  }
}

export function clampGoal(ron: number): number {
  if (!Number.isFinite(ron)) return DEFAULT_GOAL_RON;
  return Math.max(MIN_GOAL_RON, Math.min(MAX_GOAL_RON, Math.round(ron)));
}

export function readWeeklyGoal(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_WEEKLY_GOAL_RON;
  try {
    const raw = localStorage.getItem(WEEKLY_STORAGE_KEY);
    if (!raw) return DEFAULT_WEEKLY_GOAL_RON;
    return clampWeeklyGoal(Number(raw));
  } catch {
    return DEFAULT_WEEKLY_GOAL_RON;
  }
}

export function writeWeeklyGoal(ron: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(WEEKLY_STORAGE_KEY, String(clampWeeklyGoal(ron)));
  } catch {
    // ignore
  }
}

export function clampWeeklyGoal(ron: number): number {
  if (!Number.isFinite(ron)) return DEFAULT_WEEKLY_GOAL_RON;
  return Math.max(
    MIN_WEEKLY_GOAL_RON,
    Math.min(MAX_WEEKLY_GOAL_RON, Math.round(ron)),
  );
}

/**
 * Compute a progress entry for the daily goal bar.
 *  - progressPct: 0..100 (clamped, so 120% caps at 100 visually)
 *  - reached: did we hit/exceed the target
 *  - delta: RON above or below the target
 */
export function computeProgress(today: number, goal: number) {
  const safeGoal = goal > 0 ? goal : DEFAULT_GOAL_RON;
  const rawPct = (today / safeGoal) * 100;
  return {
    progressPct: Math.max(0, Math.min(100, rawPct)),
    rawPct,
    reached: today >= safeGoal,
    delta: today - safeGoal,
  };
}
