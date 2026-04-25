// Pure constants/types/predicates only — safe to import from client components.
// Server-only readers (cookies()/req.cookies) live in consent.server.ts.

export const CONSENT_COOKIE = 'hir_consent';
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

export type ConsentValue = 'essential' | 'all';

export function isConsent(v: unknown): v is ConsentValue {
  return v === 'essential' || v === 'all';
}
