// getLocale vs getChosenLocale.
//
// The distinction is load-bearing and easy to undo by accident. The marketing
// landing must not follow Accept-Language — an English browser arriving from
// Google has to see the same Romanian page Google indexed — but it must follow
// an explicit click on the flag. Collapsing the two helpers back into one
// would either break the SEO decision of 2026-05-10 or re-break the switcher,
// and neither failure is visible in a typecheck.

import { beforeEach, describe, expect, it, vi } from 'vitest';

let cookieValue: string | undefined;
let acceptLanguage: string | null = null;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'hir_locale' && cookieValue !== undefined ? { value: cookieValue } : undefined,
  }),
  headers: async () => ({
    get: (name: string) => (name === 'accept-language' ? acceptLanguage : null),
  }),
}));

import { getChosenLocale, getLocale } from './server';

describe('getChosenLocale', () => {
  beforeEach(() => {
    cookieValue = undefined;
    acceptLanguage = null;
  });

  it('returns the cookie the visitor set', async () => {
    cookieValue = 'en';
    await expect(getChosenLocale()).resolves.toBe('en');
  });

  // The regression this exists to catch: before 2026-11-19 the homepage
  // hardcoded "ro", so clicking the flag wrote the cookie and changed nothing.
  it('obeys an English cookie even when the browser asks for Romanian', async () => {
    cookieValue = 'en';
    acceptLanguage = 'ro-RO,ro;q=0.9';
    await expect(getChosenLocale()).resolves.toBe('en');
  });

  // The SEO decision: a crawler sends no cookie and gets the canonical page.
  it('ignores Accept-Language entirely when no cookie is set', async () => {
    acceptLanguage = 'en-GB,en;q=0.9';
    await expect(getChosenLocale()).resolves.toBe('ro');
  });

  it('falls back to Romanian for a junk cookie', async () => {
    cookieValue = 'klingon';
    acceptLanguage = 'en-GB,en;q=0.9';
    await expect(getChosenLocale()).resolves.toBe('ro');
  });
});

describe('getLocale', () => {
  beforeEach(() => {
    cookieValue = undefined;
    acceptLanguage = null;
  });

  it('still prefers the cookie', async () => {
    cookieValue = 'en';
    acceptLanguage = 'ro-RO';
    await expect(getLocale()).resolves.toBe('en');
  });

  // The difference from getChosenLocale, stated as a test so that making them
  // behave alike fails here rather than in production.
  it('does fall back to Accept-Language, unlike getChosenLocale', async () => {
    acceptLanguage = 'en-GB,en;q=0.9';
    await expect(getLocale()).resolves.toBe('en');
    await expect(getChosenLocale()).resolves.toBe('ro');
  });

  it('defaults to Romanian with neither signal', async () => {
    await expect(getLocale()).resolves.toBe('ro');
  });
});
