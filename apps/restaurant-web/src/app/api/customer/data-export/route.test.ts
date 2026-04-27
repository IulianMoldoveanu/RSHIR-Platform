// Smoke tests: covers early-return paths that don't require Supabase. Origin
// rejection, malformed JSON, and bad body shape are pure logic — they prove
// the route loads, parses, and rejects garbage before any DB call.
//
// PII/auth-gated branches (forbidden, found-but-mismatched-email) need a
// stubbed admin client; left for a follow-up when we wire a Supabase mock.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const ALLOWED = 'https://demo.hir.ro';

function makeReq(init: { body?: unknown; origin?: string | null; ip?: string }) {
  const headers: Record<string, string> = {};
  if (init.origin !== null && init.origin !== undefined) headers['origin'] = init.origin;
  if (init.ip) headers['x-forwarded-for'] = init.ip;
  const body =
    typeof init.body === 'string' ? init.body : init.body !== undefined ? JSON.stringify(init.body) : undefined;
  return new NextRequest('http://localhost/api/customer/data-export', {
    method: 'POST',
    headers,
    body,
  });
}

describe('POST /api/customer/data-export', () => {
  beforeEach(() => {
    process.env.ALLOWED_ORIGINS = ALLOWED;
    // Honor x-forwarded-for so rate-limit keys are deterministic per test.
    process.env.TRUST_PROXY = '1';
  });
  afterEach(() => {
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.TRUST_PROXY;
  });

  it('returns 403 when ALLOWED_ORIGINS is unset', async () => {
    delete process.env.ALLOWED_ORIGINS;
    const res = await POST(makeReq({ origin: ALLOWED, body: {}, ip: '1.1.1.1' }));
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('forbidden_origin');
  });

  it('returns 403 when origin header is missing', async () => {
    const res = await POST(makeReq({ origin: null, body: {}, ip: '2.2.2.2' }));
    expect(res.status).toBe(403);
  });

  it('returns 403 when origin is not in the allowlist', async () => {
    const res = await POST(makeReq({ origin: 'https://evil.example.com', body: {}, ip: '3.3.3.3' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 invalid_json when body is not valid JSON', async () => {
    const res = await POST(makeReq({ origin: ALLOWED, body: 'not-json', ip: '4.4.4.4' }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_json');
  });

  it('returns 400 invalid_body when payload misses required fields', async () => {
    const res = await POST(makeReq({ origin: ALLOWED, body: {}, ip: '5.5.5.5' }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_body');
  });

  it('rate-limits after the 6-token bucket is drained for a single IP', async () => {
    // Bucket capacity is 6; valid-origin + bad-body still consumes a token,
    // so the 7th call from the same IP is 429. Use a unique IP for this test
    // to avoid colliding with other tests' buckets (they use their own).
    const ip = '6.6.6.6';
    for (let i = 0; i < 6; i++) {
      const res = await POST(makeReq({ origin: ALLOWED, body: {}, ip }));
      expect(res.status).toBe(400);
    }
    const res = await POST(makeReq({ origin: ALLOWED, body: {}, ip }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });
});
