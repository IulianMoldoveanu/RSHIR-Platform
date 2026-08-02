import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

// Regression cover for the framing headers. This shipped broken once: a
// blanket `X-Frame-Options: SAMEORIGIN` in next.config.mjs meant the embed
// widget's iframe was refused on every merchant domain, silently killing the
// product. The rules below are the contract that keeps that from recurring.

function req(url: string, cookie?: string) {
  return new NextRequest(new URL(url), {
    headers: cookie ? { host: 'hirforyou.ro', cookie } : { host: 'hirforyou.ro' },
  });
}

describe('middleware framing headers', () => {
  it('locks framing to same-origin on a normal request', () => {
    const res = middleware(req('https://hirforyou.ro/cum-functioneaza'));
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
  });

  it('allows third-party framing when ?embed=1 is present', () => {
    const res = middleware(req('https://hirforyou.ro/?tenant=restaurant-demo&embed=1'));
    // X-Frame-Options has no "allow this third party" value, so any value at
    // all would re-break the widget.
    expect(res.headers.get('x-frame-options')).toBeNull();
    expect(res.headers.get('content-security-policy')).toContain('frame-ancestors *');
  });

  it('keeps allowing framing on later navigation, where only the cookie remains', () => {
    const res = middleware(req('https://hirforyou.ro/checkout', 'hir_embed=1'));
    expect(res.headers.get('x-frame-options')).toBeNull();
    expect(res.headers.get('content-security-policy')).toContain('frame-ancestors *');
  });

  it('ships the nonce-free CSP directives on every response', () => {
    const csp = middleware(req('https://hirforyou.ro/')).headers.get('content-security-policy') ?? '';
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain('upgrade-insecure-requests');
  });
});
