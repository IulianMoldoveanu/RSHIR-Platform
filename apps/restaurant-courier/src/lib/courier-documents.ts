/**
 * LocalStorage helpers for courier-self document expiry tracking.
 *
 * Tracks 4 documents required for legal courier operation in Romania:
 *   - dl (permis de conducere)
 *   - vehicleReg (carte de identitate vehicul)
 *   - rca (asigurare RCA — obligatorie)
 *   - casco (asigurare CASCO — opțional)
 *
 * Each value is an ISO date string "YYYY-MM-DD" or null when not set.
 * The persisted shape is a versioned JSON object so future migrations are
 * trivial (e.g. adding ITP, atestat profesional).
 */

export type CourierDocs = {
  dl: string | null;
  vehicleReg: string | null;
  rca: string | null;
  casco: string | null;
};

export const EMPTY_DOCS: CourierDocs = {
  dl: null,
  vehicleReg: null,
  rca: null,
  casco: null,
};

export const STORAGE_KEY = 'hir-courier-documents';

/** Read documents map from LocalStorage. Returns EMPTY_DOCS on any error. */
export function readDocs(): CourierDocs {
  if (typeof localStorage === 'undefined') return EMPTY_DOCS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_DOCS;
    const parsed = JSON.parse(raw) as Partial<CourierDocs>;
    return {
      dl: typeof parsed.dl === 'string' ? parsed.dl : null,
      vehicleReg: typeof parsed.vehicleReg === 'string' ? parsed.vehicleReg : null,
      rca: typeof parsed.rca === 'string' ? parsed.rca : null,
      casco: typeof parsed.casco === 'string' ? parsed.casco : null,
    };
  } catch {
    return EMPTY_DOCS;
  }
}

/** Persist documents map to LocalStorage. */
export function writeDocs(docs: CourierDocs): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
  } catch {
    // Quota or private mode — fail silently.
  }
}

export type ExpiryState = 'unset' | 'expired' | 'critical' | 'warning' | 'ok';

/**
 * Classify an ISO date string by remaining days.
 *  - null         → unset
 *  - <0 days      → expired
 *  - 0..7 days    → critical
 *  - 8..30 days   → warning
 *  - >30 days     → ok
 */
export function classifyExpiry(
  iso: string | null,
  now: Date = new Date(),
): { state: ExpiryState; daysRemaining: number | null } {
  if (!iso) return { state: 'unset', daysRemaining: null };
  const expiry = new Date(`${iso}T23:59:59`);
  if (Number.isNaN(expiry.getTime())) return { state: 'unset', daysRemaining: null };
  const days = Math.floor((expiry.getTime() - now.getTime()) / 86_400_000);
  let state: ExpiryState;
  if (days < 0) state = 'expired';
  else if (days <= 7) state = 'critical';
  else if (days <= 30) state = 'warning';
  else state = 'ok';
  return { state, daysRemaining: days };
}

/** Format ISO YYYY-MM-DD as Romanian dd.mm.yyyy. Returns "—" for null. */
export function formatRoDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}
