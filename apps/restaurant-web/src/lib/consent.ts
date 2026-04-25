import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

export const CONSENT_COOKIE = 'hir_consent';
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

export type ConsentValue = 'essential' | 'all';

export function isConsent(v: unknown): v is ConsentValue {
  return v === 'essential' || v === 'all';
}

export function getConsent(req?: NextRequest): ConsentValue | null {
  const raw = req
    ? req.cookies.get(CONSENT_COOKIE)?.value
    : cookies().get(CONSENT_COOKIE)?.value;
  return isConsent(raw) ? raw : null;
}

export function hasAnalyticsConsent(req?: NextRequest): boolean {
  return getConsent(req) === 'all';
}
