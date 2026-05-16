// Smoke test for checkout/intent. Covers tenant_not_found and the 503 closed
// gate. Deeper validation (computeQuote, payment intent creation) needs a
// Supabase + Stripe mock harness — left for a follow-up.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

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

vi.mock('@/lib/payments/provider-router', () => ({
  createCheckoutSession: vi.fn(() => {
    throw new Error('provider router should not be called for early-return paths');
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

const ALLOWED = 'https://demo.hir.ro';

function makeReq(body: unknown, opts: { origin?: string | null } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const origin = opts.origin === undefined ? ALLOWED : opts.origin;
  if (origin) headers['origin'] = origin;
  return new NextRequest('http://localhost/api/checkout/intent', {
    method: 'POST',
    headers,
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
  beforeEach(() => {
    process.env.ALLOWED_ORIGINS = ALLOWED;
  });
  afterEach(() => {
    delete process.env.ALLOWED_ORIGINS;
    vi.clearAllMocks();
  });

  it('returns 403 forbidden_origin when Origin header is missing', async () => {
    const res = await POST(makeReq({ items: [] }, { origin: null }));
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('forbidden_origin');
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

  it('returns 422 card_disabled when tenant is in cod_only mode and body asks for CARD', async () => {
    // PSP_TENANT_TOGGLE_ENABLED=true makes resolvePaymentSurface honor the
    // per-tenant mode. cod_only → CARD radio is hidden client-side and the
    // intent route refuses CARD bodies.
    process.env.PSP_TENANT_TOGGLE_ENABLED = 'true';
    const tenant = await import('@/lib/tenant');
    (tenant.resolveTenantFromHost as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      tenant: {
        ...FAKE_TENANT,
        settings: { ...FAKE_TENANT.settings, payments: { mode: 'cod_only' } },
      },
      host: 's1.hir.ro',
      slug: 's1',
    });
    const res = await POST(
      makeReq({
        items: [{ itemId: '11111111-1111-1111-1111-111111111111', quantity: 1 }],
        fulfillment: 'DELIVERY',
        customer: { firstName: 'Ion', lastName: 'Pop', phone: '+40712345678' },
        address: { line1: 'Strada X 1', city: 'Brasov', lat: 45.6, lng: 25.6 },
        paymentMethod: 'CARD',
      }),
    );
    delete process.env.PSP_TENANT_TOGGLE_ENABLED;
    expect(res.status).toBe(422);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('card_disabled');
  });
});
