/**
 * Tracks consecutive successful deliveries in LocalStorage.
 * Used by the appreciation toast to celebrate milestones (10, 20, ...).
 *
 * State: { count: number }
 * Resets to 0 at 100 (per spec) to keep the number meaningful and avoid
 * the counter becoming stale after a courier takes a long break.
 *
 * Never throws — every path is guarded for private-mode / quota errors.
 */
const KEY = 'hir.courier.deliveryStreak';
const MILESTONE = 10;
const RESET_AT = 100;

type StreakState = { count: number };

function read(): StreakState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { count: 0 };
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null && 'count' in parsed) {
      return { count: Number((parsed as { count: unknown }).count) || 0 };
    }
  } catch {
    // Ignore
  }
  return { count: 0 };
}

function write(state: StreakState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Quota / private mode — silent.
  }
}

/**
 * Increment the streak counter by 1.
 * Returns the new count. Wraps at RESET_AT.
 */
export function incrementStreak(): number {
  const state = read();
  const next = state.count >= RESET_AT ? 1 : state.count + 1;
  write({ count: next });
  return next;
}

/**
 * Returns true if `count` is exactly a milestone that should trigger
 * an appreciation toast.
 */
export function isMilestone(count: number): boolean {
  return count > 0 && count % MILESTONE === 0;
}
