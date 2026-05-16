/**
 * Achievement badge definitions + localStorage persistence.
 *
 * Badges are computed client-side from server-passed data:
 *   - totalDeliveries: total DELIVERED orders for this courier (all time)
 *   - nightDeliveries: DELIVERED orders between 22:00 and 06:00 (last 30d)
 *   - shiftHours: hours in longest single shift (last 30d)
 *   - consecutiveDays: max consecutive calendar days with at least one delivery (last 30d)
 *
 * Unlock dates are persisted in localStorage so a courier sees "unlocked 3 days ago"
 * and gets a toast only on first unlock (not on every page visit).
 *
 * Never throws — every path guards for private-mode / SSR.
 */

const STORAGE_KEY = 'hir.courier.achievements.v1';

export type BadgeId =
  | 'delivery_1'
  | 'delivery_10'
  | 'delivery_100'
  | 'delivery_1000'
  | 'night_courier'
  | 'marathon'
  | 'full_week';

export type BadgeDef = {
  id: BadgeId;
  label: string;
  description: string;
  /** Lucide icon name used in the UI component. */
  icon: string;
  /** Colour tone for the unlocked state — Tailwind prefix (e.g. "violet", "amber"). */
  tone: 'violet' | 'amber' | 'emerald' | 'sky' | 'rose';
};

export const BADGE_DEFS: BadgeDef[] = [
  {
    id: 'delivery_1',
    label: 'Prima livrare',
    description: 'Ai finalizat prima ta livrare HIR.',
    icon: 'Package',
    tone: 'emerald',
  },
  {
    id: 'delivery_10',
    label: '10 livrări',
    description: 'Ai finalizat 10 livrări.',
    icon: 'Star',
    tone: 'violet',
  },
  {
    id: 'delivery_100',
    label: '100 livrări',
    description: 'Ai finalizat 100 de livrări. Bravo!',
    icon: 'Award',
    tone: 'amber',
  },
  {
    id: 'delivery_1000',
    label: '1000 livrări',
    description: 'Ai finalizat 1000 de livrări. Legendă!',
    icon: 'Trophy',
    tone: 'rose',
  },
  {
    id: 'night_courier',
    label: 'Curier de noapte',
    description: '10 livrări între orele 22:00 și 06:00.',
    icon: 'Moon',
    tone: 'sky',
  },
  {
    id: 'marathon',
    label: 'Maraton',
    description: 'O tură de cel puțin 8 ore.',
    icon: 'Timer',
    tone: 'amber',
  },
  {
    id: 'full_week',
    label: 'Săptămână plină',
    description: '5 zile consecutive cu cel puțin o livrare.',
    icon: 'CalendarCheck',
    tone: 'violet',
  },
];

export type AchievementState = {
  /** ISO date string when this badge was first unlocked. Absent = locked. */
  unlockedAt?: string;
};

type StoredAchievements = Partial<Record<BadgeId, AchievementState>>;

function readStore(): StoredAchievements {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as StoredAchievements;
    }
  } catch {
    // private mode or quota error
  }
  return {};
}

function writeStore(store: StoredAchievements): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // private mode or quota error — silent
  }
}

/** Returns the stored achievements map (badge id → state). */
export function getStoredAchievements(): StoredAchievements {
  return readStore();
}

/**
 * Evaluates which badges are now earned given the current metrics.
 * Writes any newly unlocked badges to localStorage.
 * Returns the list of badge IDs that were unlocked for the FIRST TIME
 * during this call (used for toast notifications).
 */
export function evaluateAndPersist(metrics: {
  totalDeliveries: number;
  nightDeliveries: number;
  longestShiftHours: number;
  maxConsecutiveDays: number;
}): BadgeId[] {
  const store = readStore();
  const newlyUnlocked: BadgeId[] = [];
  const now = new Date().toISOString();

  const earned: BadgeId[] = [];
  if (metrics.totalDeliveries >= 1) earned.push('delivery_1');
  if (metrics.totalDeliveries >= 10) earned.push('delivery_10');
  if (metrics.totalDeliveries >= 100) earned.push('delivery_100');
  if (metrics.totalDeliveries >= 1000) earned.push('delivery_1000');
  if (metrics.nightDeliveries >= 10) earned.push('night_courier');
  if (metrics.longestShiftHours >= 8) earned.push('marathon');
  if (metrics.maxConsecutiveDays >= 5) earned.push('full_week');

  for (const id of earned) {
    if (!store[id]?.unlockedAt) {
      store[id] = { unlockedAt: now };
      newlyUnlocked.push(id);
    }
  }

  if (newlyUnlocked.length > 0) {
    writeStore(store);
  }

  return newlyUnlocked;
}
