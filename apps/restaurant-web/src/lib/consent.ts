// Pure constants/types/predicates only — safe to import from client components.
// Server-only readers (cookies()/req.cookies) live in consent.server.ts.

export const CONSENT_COOKIE = 'hir_consent';
// 12 months — Romanian DPA + EDPB guidance recommend re-prompting consent at
// most once a year. We mirror the same TTL to the localStorage record so the
// cookie and `hir_consent_v1` stay in sync.
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
export const CONSENT_LOCALSTORAGE_KEY = 'hir_consent_v1';
// 12 months in ms — used by client to decide whether to re-prompt.
export const CONSENT_RE_PROMPT_MS = 365 * 24 * 60 * 60 * 1000;

// Versioned record so we can extend categories later without re-prompting.
export type ConsentRecord = {
  v: 1;
  essential: true; // always on
  analytics: boolean;
  marketing: boolean;
  ts: number; // ms epoch when the user picked
};

// Legacy 2-button values still read from old cookies until they expire.
export type LegacyConsentValue = 'essential' | 'all';

export function isLegacyConsent(v: unknown): v is LegacyConsentValue {
  return v === 'essential' || v === 'all';
}

export function isConsentRecord(v: unknown): v is ConsentRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    r.v === 1 &&
    r.essential === true &&
    typeof r.analytics === 'boolean' &&
    typeof r.marketing === 'boolean' &&
    typeof r.ts === 'number'
  );
}

// Promote a legacy "all"/"essential" cookie to the structured record so the
// rest of the codebase only deals with one shape.
export function legacyToRecord(value: LegacyConsentValue, ts = Date.now()): ConsentRecord {
  return {
    v: 1,
    essential: true,
    analytics: value === 'all',
    marketing: value === 'all',
    ts,
  };
}

// Parse whatever was stored — JSON record, legacy string, or garbage.
export function parseConsent(raw: string | null | undefined): ConsentRecord | null {
  if (!raw) return null;
  if (isLegacyConsent(raw)) return legacyToRecord(raw);
  try {
    const parsed = JSON.parse(raw);
    return isConsentRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function serializeConsent(record: ConsentRecord): string {
  return JSON.stringify(record);
}

export function isExpired(record: ConsentRecord, now = Date.now()): boolean {
  return now - record.ts > CONSENT_RE_PROMPT_MS;
}

export const ESSENTIAL_RECORD: Omit<ConsentRecord, 'ts'> = {
  v: 1,
  essential: true,
  analytics: false,
  marketing: false,
};

export const ALL_RECORD: Omit<ConsentRecord, 'ts'> = {
  v: 1,
  essential: true,
  analytics: true,
  marketing: true,
};
