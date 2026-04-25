import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { CONSENT_COOKIE, type ConsentValue, isConsent } from './consent';

export function getConsent(req?: NextRequest): ConsentValue | null {
  const raw = req
    ? req.cookies.get(CONSENT_COOKIE)?.value
    : cookies().get(CONSENT_COOKIE)?.value;
  return isConsent(raw) ? raw : null;
}

export function hasAnalyticsConsent(req?: NextRequest): boolean {
  return getConsent(req) === 'all';
}
