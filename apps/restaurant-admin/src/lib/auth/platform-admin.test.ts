// Tests for the shared platform-admin guard.
//
// The async helpers (`requirePlatformAdmin` + `getPlatformAdmin`) depend on
// `createServerClient` which reads cookies via next/headers — that hook
// can't run inside vitest without a Next runtime. We exercise the pure
// allow-list parser via the sync helper, which guarantees the parsing
// rules (comma-split, trim, lowercase) match the legacy duplicates.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isPlatformAdminEmail } from './platform-admin';

describe('isPlatformAdminEmail', () => {
  const ORIGINAL = process.env.HIR_PLATFORM_ADMIN_EMAILS;

  beforeEach(() => {
    delete process.env.HIR_PLATFORM_ADMIN_EMAILS;
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.HIR_PLATFORM_ADMIN_EMAILS;
    else process.env.HIR_PLATFORM_ADMIN_EMAILS = ORIGINAL;
  });

  it('returns false for null / undefined / empty email', () => {
    process.env.HIR_PLATFORM_ADMIN_EMAILS = 'iulian@hir.ro';
    expect(isPlatformAdminEmail(null)).toBe(false);
    expect(isPlatformAdminEmail(undefined)).toBe(false);
    expect(isPlatformAdminEmail('')).toBe(false);
  });

  it('returns false when env is unset or empty', () => {
    expect(isPlatformAdminEmail('iulian@hir.ro')).toBe(false);
    process.env.HIR_PLATFORM_ADMIN_EMAILS = '';
    expect(isPlatformAdminEmail('iulian@hir.ro')).toBe(false);
  });

  it('matches case-insensitively', () => {
    process.env.HIR_PLATFORM_ADMIN_EMAILS = 'Iulian@HIR.ro';
    expect(isPlatformAdminEmail('iulian@hir.ro')).toBe(true);
    expect(isPlatformAdminEmail('IULIAN@hir.ro')).toBe(true);
  });

  it('splits on comma and trims whitespace', () => {
    process.env.HIR_PLATFORM_ADMIN_EMAILS = ' a@x.io , b@x.io ,c@x.io';
    expect(isPlatformAdminEmail('a@x.io')).toBe(true);
    expect(isPlatformAdminEmail('b@x.io')).toBe(true);
    expect(isPlatformAdminEmail('c@x.io')).toBe(true);
    expect(isPlatformAdminEmail('d@x.io')).toBe(false);
  });

  it('drops empty segments produced by trailing commas', () => {
    process.env.HIR_PLATFORM_ADMIN_EMAILS = 'a@x.io,,';
    // The empty string must not match an empty email — guarded by the
    // explicit `if (!email)` short-circuit.
    expect(isPlatformAdminEmail('')).toBe(false);
    expect(isPlatformAdminEmail('a@x.io')).toBe(true);
  });
});
