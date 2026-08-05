import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { checkOrigin } from './origin-check';

// This guard sits in front of the offline-transition drain endpoint, so when it
// says no, a courier's accept/pickup/deliver is discarded with no error anyone
// sees. It shipped depending only on an env list, which drifted, and dropped
// every offline transition on production. Hence tests.

const REAL = 'https://curier.hirforyou.ro';

function req(opts: { origin?: string; host?: string; proto?: string }): NextRequest {
  const headers = new Headers();
  if (opts.origin) headers.set('origin', opts.origin);
  headers.set('x-forwarded-host', opts.host ?? 'curier.hirforyou.ro');
  headers.set('x-forwarded-proto', opts.proto ?? 'https');
  return new NextRequest(`${REAL}/api/courier/transitions/drain`, { method: 'POST', headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('checkOrigin', () => {
  it('accepts the host it was served on even when the env list names another', () => {
    // The production configuration that dropped every offline transition.
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://hir-restaurant-courier.vercel.app');
    expect(checkOrigin(req({ origin: REAL }))).toBe(true);
  });

  it('accepts a second domain served by the same app', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://hir-restaurant-courier.vercel.app');
    expect(
      checkOrigin(
        req({ origin: 'https://courier.hirforyou.ro', host: 'courier.hirforyou.ro' }),
      ),
    ).toBe(true);
  });

  it('accepts an extra origin from the env list', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://admin.hirforyou.ro');
    expect(checkOrigin(req({ origin: 'https://admin.hirforyou.ro' }))).toBe(true);
  });

  it('rejects a foreign origin', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', REAL);
    expect(checkOrigin(req({ origin: 'https://evil.example' }))).toBe(false);
  });

  it('rejects a foreign origin when no env list is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    expect(checkOrigin(req({ origin: 'https://evil.example' }))).toBe(false);
  });

  it('does not confuse a lookalike host', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', REAL);
    expect(checkOrigin(req({ origin: 'https://curier.hirforyou.ro.evil.example' }))).toBe(false);
  });

  it('denies a missing Origin header in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', REAL);
    expect(checkOrigin(req({}))).toBe(false);
  });

  it('permits a missing Origin header outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(checkOrigin(req({}))).toBe(true);
  });

  it('matches on scheme, not just host', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', REAL);
    expect(checkOrigin(req({ origin: 'http://curier.hirforyou.ro' }))).toBe(false);
  });
});
