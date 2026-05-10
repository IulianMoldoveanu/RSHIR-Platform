import { cookies, type UnsafeUnwrappedCookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import {
  CONSENT_COOKIE,
  type ConsentRecord,
  isExpired,
  parseConsent,
} from './consent';

export function getConsent(req?: NextRequest): ConsentRecord | null {
  const raw = req
    ? req.cookies.get(CONSENT_COOKIE)?.value
    : (cookies() as unknown as UnsafeUnwrappedCookies).get(CONSENT_COOKIE)?.value;
  const record = parseConsent(raw);
  if (!record) return null;
  // Expired records are treated as "no consent yet" so the banner re-appears
  // on the next visit. Server callers (analytics, customer recognition) get
  // null and behave conservatively.
  if (isExpired(record)) return null;
  return record;
}

export function hasAnalyticsConsent(req?: NextRequest): boolean {
  return getConsent(req)?.analytics === true;
}

export function hasMarketingConsent(req?: NextRequest): boolean {
  return getConsent(req)?.marketing === true;
}
