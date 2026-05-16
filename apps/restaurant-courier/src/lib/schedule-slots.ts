/**
 * LocalStorage-backed schedule slot helpers.
 *
 * A slot key is "YYYY-MM-DDTHH" (ISO date + 2-digit hour, 24h clock).
 * Maximum 40 reserved slots per 7-day window.
 */

export const STORAGE_KEY = 'hir-courier-schedule-slots';
export const MAX_SLOTS = 40;

/** Build the canonical slot key for a date + hour. */
export function slotKey(date: Date, hour: number): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}`;
}

/** Read the persisted slot set from LocalStorage. Returns empty set on error. */
export function readSlots(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === 'string'));
  } catch {
    return new Set();
  }
}

/** Persist the slot set to LocalStorage. */
export function writeSlots(slots: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(slots)));
  } catch {
    // Storage quota or private-mode — fail silently.
  }
}

/**
 * Toggle a slot key.
 * - If already reserved: removes it.
 * - If not reserved and count < MAX_SLOTS: adds it.
 * Returns the new set (caller should call writeSlots).
 */
export function toggleSlot(slots: Set<string>, key: string): Set<string> {
  const next = new Set(slots);
  if (next.has(key)) {
    next.delete(key);
  } else if (next.size < MAX_SLOTS) {
    next.add(key);
  }
  return next;
}

/**
 * Build the mailto body listing reserved slots in RO format.
 * Groups consecutive hours on the same day into ranges.
 * E.g. slots for Monday 09:00 + 10:00 + 11:00 → "Luni 19/05 09:00-12:00"
 */
const RO_DAYS = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];

export function buildMailtoBody(slots: Set<string>): string {
  if (slots.size === 0) return 'Nu am rezervat nicio tură.';

  // Parse keys into { date: string, hour: number }
  const parsed = Array.from(slots)
    .map((key) => {
      const [datePart, hourPart] = key.split('T');
      return { datePart, hour: parseInt(hourPart, 10) };
    })
    .sort((a, b) => a.datePart.localeCompare(b.datePart) || a.hour - b.hour);

  // Group by date, then collapse consecutive hours into ranges.
  const byDate = new Map<string, number[]>();
  for (const { datePart, hour } of parsed) {
    const arr = byDate.get(datePart) ?? [];
    arr.push(hour);
    byDate.set(datePart, arr);
  }

  const lines: string[] = [];
  for (const [datePart, hours] of byDate) {
    const d = new Date(`${datePart}T12:00:00`);
    const dayName = RO_DAYS[d.getDay()];
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');

    // Collapse into ranges
    const ranges: string[] = [];
    let rangeStart = hours[0];
    let prev = hours[0];
    for (let i = 1; i <= hours.length; i++) {
      const cur = hours[i];
      if (cur === prev + 1) {
        prev = cur;
      } else {
        ranges.push(
          `${String(rangeStart).padStart(2, '0')}:00-${String(prev + 1).padStart(2, '0')}:00`,
        );
        rangeStart = cur;
        prev = cur;
      }
    }
    lines.push(`${dayName} ${dd}/${mm}: ${ranges.join(', ')}`);
  }

  return lines.join('\n');
}
