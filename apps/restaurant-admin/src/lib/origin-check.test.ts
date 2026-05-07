// QA-PASS-2026-05-08 — locks the assertSameOrigin contract used as the
// CSRF defense layer in front of every cookie-authed POST/PATCH/DELETE
// route on the admin app. Locked here because the helper itself was
// uncovered by tests at the time the QA pass was run, and we just added
// it to two more routes (/api/admin/audit/verify, /api/admin/support/reply).

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { assertSameOrigin } from './origin-check';

function fakeReq(headers: Record<string, string | undefined>): {
  headers: { get: (name: string) => string | null };
} {
  return {
    headers: {
      get(name: string): string | null {
        const v = headers[name.toLowerCase()];
        return v === undefined ? null : v;
      },
    },
  };
}

describe('assertSameOrigin', () => {
  const ORIGINAL = process.env.ALLOWED_ORIGINS;

  beforeEach(() => {
    process.env.ALLOWED_ORIGINS = 'https://admin.hir.ro,https://hir.ro';
  });

  afterEach(() => {
    process.env.ALLOWED_ORIGINS = ORIGINAL;
  });

  it('accepts a request whose Origin matches the allow-list', () => {
    const req = fakeReq({ origin: 'https://admin.hir.ro' });
    expect(
      assertSameOrigin(req as unknown as Parameters<typeof assertSameOrigin>[0]),
    ).toEqual({ ok: true });
  });

  it('falls back to Referer when Origin is missing', () => {
    const req = fakeReq({ referer: 'https://hir.ro/dashboard/admin/foo' });
    expect(
      assertSameOrigin(req as unknown as Parameters<typeof assertSameOrigin>[0]),
    ).toEqual({ ok: true });
  });

  it('rejects when both Origin and Referer are missing (forged request)', () => {
    const req = fakeReq({});
    const r = assertSameOrigin(
      req as unknown as Parameters<typeof assertSameOrigin>[0],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('origin_missing');
  });

  it('rejects an Origin not in the allow-list (cross-site forge attempt)', () => {
    const req = fakeReq({ origin: 'https://evil.example' });
    const r = assertSameOrigin(
      req as unknown as Parameters<typeof assertSameOrigin>[0],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('origin_not_allowed');
  });

  it('rejects when ALLOWED_ORIGINS is unset (fail-closed misconfig)', () => {
    delete process.env.ALLOWED_ORIGINS;
    const req = fakeReq({ origin: 'https://admin.hir.ro' });
    const r = assertSameOrigin(
      req as unknown as Parameters<typeof assertSameOrigin>[0],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('allowed_origins_unset');
  });

  it('rejects an unparseable Referer (no scheme)', () => {
    const req = fakeReq({ referer: 'not a url' });
    const r = assertSameOrigin(
      req as unknown as Parameters<typeof assertSameOrigin>[0],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('origin_missing');
  });

  it('Origin takes precedence over Referer when both are present', () => {
    const req = fakeReq({
      origin: 'https://evil.example',
      referer: 'https://admin.hir.ro/foo',
    });
    const r = assertSameOrigin(
      req as unknown as Parameters<typeof assertSameOrigin>[0],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('origin_not_allowed');
  });
});
