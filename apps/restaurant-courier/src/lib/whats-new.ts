/**
 * "What's new" release log. Bump CURRENT_RELEASE.id when a new entry is
 * added — the in-app banner fires once per courier when their stored
 * last-seen id doesn't match.
 *
 * Keep entries SHORT (3-5 bullets). Couriers read these between deliveries,
 * not at a desk; long releases get skimmed and ignored.
 */

export type ReleaseEntry = {
  id: string;
  title: string;
  date: string;
  bullets: string[];
};

export const CURRENT_RELEASE: ReleaseEntry = {
  id: '2026-05-16',
  title: 'Update HIR Curier',
  date: '16 mai 2026',
  bullets: [
    'Iconițe vehicule 3D realiste (mașină, scuter, bicicletă).',
    'Sunet ofertă distinct + ore de liniște configurabile.',
    'Țintă zilnică cu progres + sparkline ultimele 7 zile.',
    'Multi-stop: vezi rapid următoarea oprire când ai 2+ comenzi.',
    'Diagnostic dispozitiv + istoricul curselor.',
  ],
};

export const STORAGE_KEY = 'hir-courier-last-seen-release';

export function hasSeenCurrentRelease(): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === CURRENT_RELEASE.id;
  } catch {
    return true;
  }
}

export function markCurrentReleaseSeen(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, CURRENT_RELEASE.id);
  } catch {
    // ignore
  }
}
