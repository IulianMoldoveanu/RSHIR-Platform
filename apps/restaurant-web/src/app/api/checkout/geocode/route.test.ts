// Regression tests for /api/checkout/geocode — the server-side Nominatim
// proxy. The route has real security teeth (origin check + per-IP rate
// limit + cache) and a hard external-policy invariant (1 req/sec OSM),
// so locking those into tests is high leverage before the pilot lift-off.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const geocodeMock = vi.fn();
vi.mock('@/lib/zones/nominatim', () => ({
  geocodeAddressRoVerbose: (q: string) => geocodeMock(q),
}));

type LimitResult = { ok: true } | { ok: false; retryAfterSec: number };
const checkLimitMock = vi.fn(
  (_key: string, _opts: unknown): LimitResult => ({ ok: true }),
);
vi.mock('@/lib/rate-limit', () => ({
  checkLimit: (key: string, opts: unknown) => checkLimitMock(key, opts),
  clientIp: () => '127.0.0.1',
}));

vi.mock('@/lib/origin-check', () => ({
  assertSameOrigin: () => ({ ok: true }),
}));

import { POST } from './route';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/checkout/geocode', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ADDR = {
  address: {
    line1: 'Strada Republicii 1',
    city: 'Brașov',
    postalCode: '500030',
    country: 'Romania',
  },
};

describe('POST /api/checkout/geocode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkLimitMock.mockReturnValue({ ok: true });
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns 429 when rate-limited', async () => {
    checkLimitMock.mockReturnValue({ ok: false, retryAfterSec: 12 });
    const res = await POST(makeReq(ADDR));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('12');
    expect(geocodeMock).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid body shape', async () => {
    const res = await POST(makeReq({ address: { line1: '' } }));
    expect(res.status).toBe(400);
    expect(geocodeMock).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/checkout/geocode', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 404 when Nominatim has no hit', async () => {
    geocodeMock.mockResolvedValueOnce(null);
    const res = await POST(makeReq(ADDR));
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('not_found');
  });

  it('returns lat/lng/displayName on success', async () => {
    // Unique address per test — cache is module-scoped and persists
    // across tests within this file.
    const addr = {
      address: { line1: 'Strada Lunga 100', city: 'Brașov', postalCode: '', country: 'Romania' },
    };
    geocodeMock.mockResolvedValueOnce({
      lat: 45.6427,
      lng: 25.5887,
      displayName: 'Strada Lunga 100, Brașov, Romania',
    });
    const res = await POST(makeReq(addr));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { lat: number; lng: number; displayName: string; cached: boolean };
    expect(json.lat).toBe(45.6427);
    expect(json.lng).toBe(25.5887);
    expect(json.displayName).toContain('Brașov');
    expect(json.cached).toBe(false);
  });

  it('serves cached hit on repeat (case + whitespace insensitive)', async () => {
    const addr = {
      address: { line1: 'Strada Mureșenilor 7', city: 'Brașov', postalCode: '500030', country: 'Romania' },
    };
    geocodeMock.mockResolvedValueOnce({
      lat: 45.6489,
      lng: 25.6053,
      displayName: 'Strada Mureșenilor 7, Brașov, Romania',
    });
    const r1 = await POST(makeReq(addr));
    expect(r1.status).toBe(200);
    expect(geocodeMock).toHaveBeenCalledTimes(1);

    // Hammer the cache with a noisier version of the same address.
    const noisy = {
      address: {
        line1: '  STRADA MUREȘENILOR 7 ',
        city: 'brasov',
        postalCode: '500030',
        country: 'Romania',
      },
    };
    const r2 = await POST(makeReq(noisy));
    expect(r2.status).toBe(200);
    const json = (await r2.json()) as { cached: boolean };
    expect(json.cached).toBe(true);
    // Critically — second call did NOT spend an OSM budget unit.
    expect(geocodeMock).toHaveBeenCalledTimes(1);
  });
});
