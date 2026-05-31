// Smoke test for checkout/intent. Covers tenant_not_found, the 503 closed
// gate, and the OTP server gate. Deeper validation (computeQuote, payment
// intent creation) needs a Supabase + PSP mock harness — left for a follow-up.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mutable admin mock — default throws so early-return tests catch accidental
// DB calls; OTP tests override adminMockImpl per-case.
let adminMockImpl: () => unknown = () => {
  throw new Error('admin client should not be called for early-return paths');
};

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
  getSupabaseAdmin: vi.fn(() => adminMockImpl()),
}));

vi.mock('@/lib/payments/provider-router', () => ({
  createCheckoutSession: vi.fn(() => {
    throw new Error('provider router should not be called for early-return paths');
  }),
}));

vi.mock('@/lib/customer-recognition', () => ({
  maybeSetCustomerCookie: vi.fn(),
  readCustomerCookie: vi.fn(() => null),
}));

vi.mock('@/lib/integration-bus', () => ({
  dispatchOrderEvent: vi.fn(),
}));

vi.mock('../pricing', () => ({
  computeQuote: vi.fn(),
}));

vi.mock('@/lib/idempotency', () => ({
  checkIdempotency: vi.fn(),
  hashRequestBody: vi.fn(() => 'hash'),
  readIdempotencyKey: vi.fn(() => null),
  storeIdempotency: vi.fn(),
}));

vi.mock('@/lib/loyalty', () => ({
  validateRedemption: vi.fn(),
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

const VALID_BODY = {
  items: [{ itemId: '11111111-1111-1111-1111-111111111111', quantity: 1 }],
  fulfillment: 'DELIVERY',
  customer: { firstName: 'Ion', lastName: 'Pop', phone: '+40712345678' },
  address: { line1: 'Strada X 1', city: 'Brasov', lat: 45.6, lng: 25.6 },
  paymentMethod: 'COD',
};

// Builds a chainable Supabase query stub whose terminal call (.maybeSingle)
// resolves to { data, error }.
function makeQueryStub(result: { data: unknown; error: unknown }) {
  const stub: Record<string, unknown> = {};
  const chain = () => stub;
  stub.from = chain;
  stub.select = chain;
  stub.eq = chain;
  stub.not = chain;
  stub.gte = chain;
  stub.limit = chain;
  stub.maybeSingle = vi.fn(async () => result);
  return stub;
}

describe('POST /api/checkout/intent', () => {
  beforeEach(() => {
    process.env.ALLOWED_ORIGINS = ALLOWED;
    // Restore default (throw) for early-return tests.
    adminMockImpl = () => {
      throw new Error('admin client should not be called for early-return paths');
    };
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
        ...VALID_BODY,
        paymentMethod: 'CARD',
      }),
    );
    delete process.env.PSP_TENANT_TOGGLE_ENABLED;
    expect(res.status).toBe(422);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('card_disabled');
  });

  // --- OTP server gate ---

  it('skips OTP check and proceeds when otp_enabled is not set in tenant settings', async () => {
    // otp_enabled absent → gate is skipped; the request reaches computeQuote.
    // computeQuote is mocked to return a failure so we get a 422 (not 500),
    // which proves the gate was passed.
    const tenant = await import('@/lib/tenant');
    const pricing = await import('../pricing');
    adminMockImpl = () => makeQueryStub({ data: null, error: null });
    (tenant.resolveTenantFromHost as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      tenant: FAKE_TENANT, // settings has no checkout.otp_enabled
      host: 's1.hir.ro',
      slug: 's1',
    });
    (pricing.computeQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      reason: { kind: 'ITEMS_UNAVAILABLE' },
    });
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(422);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('quote_failed');
  });

  it('returns 403 otp_required when otp_enabled=true and no verified row exists', async () => {
    const tenant = await import('@/lib/tenant');
    const queryStub = makeQueryStub({ data: null, error: null }); // no row
    adminMockImpl = () => queryStub;
    (tenant.resolveTenantFromHost as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      tenant: {
        ...FAKE_TENANT,
        settings: { ...FAKE_TENANT.settings, checkout: { otp_enabled: true } },
      },
      host: 's1.hir.ro',
      slug: 's1',
    });
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string; message: string };
    expect(json.error).toBe('otp_required');
    expect(typeof json.message).toBe('string');
  });

  it('passes the OTP gate and proceeds when otp_enabled=true and a verified row exists', async () => {
    // Verified row returned → gate is cleared; the request reaches computeQuote.
    const tenant = await import('@/lib/tenant');
    const pricing = await import('../pricing');
    const queryStub = makeQueryStub({ data: { id: 'v1' }, error: null }); // verified row
    adminMockImpl = () => queryStub;
    (tenant.resolveTenantFromHost as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      tenant: {
        ...FAKE_TENANT,
        settings: { ...FAKE_TENANT.settings, checkout: { otp_enabled: true } },
      },
      host: 's1.hir.ro',
      slug: 's1',
    });
    (pricing.computeQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      reason: { kind: 'ITEMS_UNAVAILABLE' },
    });
    const res = await POST(makeReq(VALID_BODY));
    // Gate was cleared; response comes from computeQuote failure, not OTP gate.
    expect(res.status).toBe(422);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('quote_failed');
  });
});
