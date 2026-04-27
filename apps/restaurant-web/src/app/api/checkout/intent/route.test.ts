// Smoke test for checkout/intent. Covers tenant_not_found and the 503 closed
// gate. Deeper validation (computeQuote, payment intent creation) needs a
// Supabase + Stripe mock harness — left for a follow-up.

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/tenant', () => ({
  resolveTenantFromHost: vi.fn(async () => ({
    tenant: null,
    host: 'unknown.test',
    slug: 'unknown',
  })),
}));

vi.mock('@/lib/operations', () => ({
  isAcceptingOrders: vi.fn(() => true),
  isOpenNow: vi.fn(() => ({ open: true, nextOpen: null })),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(() => {
    throw new Error('admin client should not be called for early-return paths');
  }),
}));

vi.mock('@/lib/stripe/server', () => ({
  getStripe: vi.fn(() => {
    throw new Error('stripe client should not be called for early-return paths');
  }),
}));

vi.mock('@/lib/customer-recognition', () => ({
  maybeSetCustomerCookie: vi.fn(),
}));

vi.mock('@/lib/integration-bus', () => ({
  dispatchOrderEvent: vi.fn(),
}));

vi.mock('../pricing', () => ({
  computeQuote: vi.fn(),
}));

import { POST } from './route';

function makeReq(body: unknown) {
  return new Request('http://localhost/api/checkout/intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const FAKE_TENANT = {
  id: 't1',
  slug: 's1',
  name: 'T',
  settings: { pickup_enabled: true, cod_enabled: true },
};

describe('POST /api/checkout/intent', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 tenant_not_found when host does not resolve', async () => {
    const res = await POST(makeReq({ items: [] }));
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('tenant_not_found');
  });

  it('returns 503 closed when the restaurant is paused', async () => {
    const tenant = await import('@/lib/tenant');
    const ops = await import('@/lib/operations');
    (tenant.resolveTenantFromHost as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      tenant: FAKE_TENANT,
      host: 's1.hir.ro',
      slug: 's1',
    });
    (ops.isAcceptingOrders as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    const res = await POST(makeReq({ items: [] }));
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('closed');
  });

  it('returns 400 invalid_request when body fails validation', async () => {
    const tenant = await import('@/lib/tenant');
    (tenant.resolveTenantFromHost as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      tenant: FAKE_TENANT,
      host: 's1.hir.ro',
      slug: 's1',
    });
    const res = await POST(makeReq({ items: 'not-an-array' }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_request');
  });
});
