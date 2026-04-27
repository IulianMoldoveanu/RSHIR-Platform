// Smoke test for checkout/confirm. The route depends on tenant resolution
// (Next headers) and Stripe — we vi.mock both so we can hit early-return
// branches without a request context.

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/tenant', () => ({
  resolveTenantFromHost: vi.fn(async () => ({
    tenant: null,
    host: 'unknown.test',
    slug: 'unknown',
  })),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(() => {
    throw new Error('admin client should not be called when tenant resolution fails');
  }),
}));

vi.mock('@/lib/stripe/server', () => ({
  getStripe: vi.fn(() => {
    throw new Error('stripe client should not be called when tenant resolution fails');
  }),
}));

vi.mock('../order-finalize', () => ({
  markOrderPaidAndDispatch: vi.fn(),
}));

import { POST } from './route';

function makeReq(body: unknown) {
  return new Request('http://localhost/api/checkout/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/checkout/confirm', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 tenant_not_found when host does not resolve', async () => {
    const res = await POST(makeReq({ orderId: '00000000-0000-0000-0000-000000000000' }));
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('tenant_not_found');
  });

  it('returns 400 invalid_request when body fails validation', async () => {
    // Stub the mock to return a real tenant so we get past the 404.
    const tenant = await import('@/lib/tenant');
    (tenant.resolveTenantFromHost as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      tenant: { id: 't1', slug: 's1', name: 'T', settings: {} },
      host: 's1.hir.ro',
      slug: 's1',
    });
    const res = await POST(makeReq({ orderId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_request');
  });
});
