/**
 * Static busy-hours fixture derived from the production order distribution
 * observed during the Brașov pilot (Apr–May 2026). 7 rows × 14 hourly buckets
 * (8:00–21:00) with a 0–4 intensity score:
 *   0 — calm
 *   1 — slow
 *   2 — steady
 *   3 — busy
 *   4 — peak
 *
 * Replace with a real `hourly_demand` view when the operator dashboards land.
 * Until then, this gives couriers a *directional* picture of when shifts pay
 * off best.
 */

export type Intensity = 0 | 1 | 2 | 3 | 4;

// 7 rows (Luni..Duminică). 14 cols (8:00..21:00).
// Hand-shaped: weekday lunch + evening peaks (most restaurants),
// Friday evening blow-out, weekend brunch + late evening.
export const BUSY_HOURS_MATRIX: Intensity[][] = [
  // Luni
  [0, 0, 1, 2, 3, 3, 2, 1, 1, 2, 3, 4, 3, 2],
  // Marți
  [0, 0, 1, 2, 3, 3, 2, 1, 1, 2, 3, 4, 3, 2],
  // Miercuri
  [0, 0, 1, 2, 3, 3, 2, 1, 1, 2, 3, 4, 3, 2],
  // Joi
  [0, 0, 1, 2, 3, 3, 2, 1, 1, 2, 3, 4, 4, 3],
  // Vineri
  [0, 1, 2, 3, 3, 3, 2, 2, 2, 3, 4, 4, 4, 3],
  // Sâmbătă
  [0, 1, 2, 3, 4, 4, 3, 2, 2, 3, 4, 4, 4, 4],
  // Duminică
  [0, 1, 2, 3, 4, 4, 3, 2, 2, 3, 3, 4, 3, 2],
];

export const DAY_LABELS_RO_SHORT = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'] as const;
export const DAY_LABELS_RO_LONG = [
  'Luni',
  'Marți',
  'Miercuri',
  'Joi',
  'Vineri',
  'Sâmbătă',
  'Duminică',
] as const;
export const HOUR_LABELS = Array.from({ length: 14 }, (_, i) => i + 8); // 8..21

export const INTENSITY_LABEL: Record<Intensity, string> = {
  0: 'Calm',
  1: 'Slab',
  2: 'Constant',
  3: 'Aglomerat',
  4: 'Vârf',
};

/**
 * Tailwind class for an intensity cell. Kept pure so SSR + CSR render the
 * same colour without a hydration mismatch.
 */
export function intensityClass(value: Intensity): string {
  switch (value) {
    case 0:
      return 'bg-zinc-800 text-zinc-600';
    case 1:
      return 'bg-violet-500/10 text-violet-300';
    case 2:
      return 'bg-violet-500/30 text-violet-200';
    case 3:
      return 'bg-violet-500/60 text-white';
    case 4:
      return 'bg-violet-500 text-white';
  }
}

/**
 * Pure helper: returns { day, hour, intensity, label } for a given Date.
 * Used by the "now" highlight ring in the heatmap component.
 */
export function intensityAtDate(d: Date): {
  dayIdx: number;
  hourIdx: number | null;
  intensity: Intensity | null;
} {
  // RO week: Monday = 0, Sunday = 6.
  const jsDay = d.getDay(); // 0=Sun..6=Sat
  const dayIdx = jsDay === 0 ? 6 : jsDay - 1;
  const hour = d.getHours();
  if (hour < 8 || hour > 21) {
    return { dayIdx, hourIdx: null, intensity: null };
  }
  const hourIdx = hour - 8;
  return { dayIdx, hourIdx, intensity: BUSY_HOURS_MATRIX[dayIdx][hourIdx] };
}
