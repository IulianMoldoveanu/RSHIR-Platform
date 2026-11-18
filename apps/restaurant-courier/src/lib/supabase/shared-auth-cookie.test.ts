// A fleet manager works on two hosts — app.hirforyou.ro for tariffs and
// couriers, curier.hirforyou.ro for dispatch, orders and payouts — and was
// being asked for a password on each. The middlewares already intended to
// share the session, but sign-in happens in the browser and wrote a
// host-scoped cookie, so the SSO only worked when a token refresh happened to
// land first. These are the cases that decide the cookie's scope.

import { describe, expect, it } from 'vitest';
import { sharedAuthCookieOptions, supabaseAuthCookieNames } from '@hir/supabase-types';

describe('sharedAuthCookieOptions', () => {
  it('shares the session across the staff hosts', () => {
    for (const host of [
      'app.hirforyou.ro',
      'curier.hirforyou.ro',
      'courier.hirforyou.ro', // both spellings are live, both have certs
      'hirforyou.ro',
    ]) {
      expect(sharedAuthCookieOptions(host)).toEqual({ domain: '.hirforyou.ro' });
    }
  });

  it('keeps host scope on localhost so dev ports stay separate', () => {
    expect(sharedAuthCookieOptions('localhost')).toEqual({});
    expect(sharedAuthCookieOptions('localhost:3000')).toEqual({});
    expect(sharedAuthCookieOptions('127.0.0.1:3002')).toEqual({});
  });

  // vercel.app is on the Public Suffix List: a browser refuses a cookie
  // scoped to it, so widening the scope on a preview would make login
  // impossible rather than convenient.
  it('keeps host scope on Vercel previews', () => {
    expect(sharedAuthCookieOptions('hir-restaurant-courier-abc123.vercel.app')).toEqual({});
    expect(sharedAuthCookieOptions('vercel.app')).toEqual({});
  });

  it('is not fooled by a lookalike host', () => {
    // endsWith('.hirforyou.ro') must not match a domain that merely contains it
    expect(sharedAuthCookieOptions('hirforyou.ro.attacker.com')).toEqual({});
    expect(sharedAuthCookieOptions('nothirforyou.ro')).toEqual({});
    expect(sharedAuthCookieOptions('evil-hirforyou.ro')).toEqual({});
  });

  it('ignores the port and the case', () => {
    expect(sharedAuthCookieOptions('APP.HirForYou.RO:443')).toEqual({ domain: '.hirforyou.ro' });
  });

  it('returns no scope when there is no host to judge', () => {
    expect(sharedAuthCookieOptions(null)).toEqual({});
    expect(sharedAuthCookieOptions(undefined)).toEqual({});
    expect(sharedAuthCookieOptions('')).toEqual({});
  });

  // The per-tenant storefront runs on hosts this function would widen, so the
  // guard is the call site, not the host: restaurant-web never calls it, and a
  // customer session stays on its own tenant host.
  it('would widen a tenant storefront host, which is why only the staff apps call it', () => {
    expect(sharedAuthCookieOptions('foisorul-a.hirforyou.ro')).toEqual({
      domain: '.hirforyou.ro',
    });
  });
});

describe('supabaseAuthCookieNames', () => {
  it('picks out the Supabase auth cookies, including the chunked ones', () => {
    const header =
      'sb-qfmeojeipncuxeltnvab-auth-token=abc; ' +
      'sb-qfmeojeipncuxeltnvab-auth-token.0=def; ' +
      'sb-qfmeojeipncuxeltnvab-auth-token.1=ghi; ' +
      'hir-keep-logged-in=1; _vercel_jwt=xyz';
    expect(supabaseAuthCookieNames(header)).toEqual([
      'sb-qfmeojeipncuxeltnvab-auth-token',
      'sb-qfmeojeipncuxeltnvab-auth-token.0',
      'sb-qfmeojeipncuxeltnvab-auth-token.1',
    ]);
  });

  it('leaves other sb- cookies alone', () => {
    expect(supabaseAuthCookieNames('sb-provider-token=x; sb-refresh=y')).toEqual([]);
  });

  it('handles an empty cookie header', () => {
    expect(supabaseAuthCookieNames('')).toEqual([]);
  });
});
