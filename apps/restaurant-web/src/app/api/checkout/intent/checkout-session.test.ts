// Verifies the migrated checkout flow uses the Netopia/Viva provider router
// (not Stripe) and that the response shape is the
// `{ url, orderId, paymentMethod: 'CARD', provider }` quadruple the
// redesigned client expects. Mocks Supabase + provider-router; no real PSP
// API calls.
//
// Iulian directive 2026-05-16: Stripe is excluded. card_sandbox routes to
// Netopia or Viva sandbox; card_live calls the live provider (still
// scaffolded). The PSP-mode resolution in the intent route is the single
// piece this test pins.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ───── Mocks ──────────────────────────────────────────────────────────

vi.mock('@/lib/tenant', () => ({
  resolveTenantFromHost: vi.fn(),
  tenantBaseUrl: vi.fn(() => 'https://demo.hir.ro'),
}));

vi.mock('@/lib/operations', () => ({
  isAcceptingOrders: vi.fn(() => true),
  isOpenNow: vi.fn(() => ({ open: true, nextOpen: null })),
}));

vi.mock('@/lib/customer-recognition', () => ({
  maybeSetCustomerCookie: vi.fn(),
  readCustomerCookie: vi.fn(() => null),
}));

vi.mock('@/lib/integration-bus', () => ({
  dispatchOrderEvent: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkLimit: vi.fn(() => ({ ok: true })),
  clientIp: vi.fn(() => '127.0.0.1'),
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

vi.mock('../pricing', () => ({
  computeQuote: vi.fn(),
}));

const mockedCreateCheckoutSession = vi.fn();
vi.mock('@/lib/payments/provider-router', () => ({
  createCheckoutSession: (...args: unknown[]) => mockedCreateCheckoutSession(...args),
}));

const supabaseAdminFactory = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => supabaseAdminFactory(),
}));

// ───── Helpers ────────────────────────────────────────────────────────

const ALLOWED = 'https://demo.hir.ro';

const FAKE_TENANT = {
  id: 't1',
  slug: 'demo',
  name: 'Demo Restaurant',
  settings: { pickup_enabled: true, cod_enabled: true },
};

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/checkout/intent', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ALLOWED,
    },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  items: [
    { itemId: '11111111-1111-1111-1111-111111111111', quantity: 2 },
  ],
  fulfillment: 'DELIVERY',
  customer: {
    firstName: 'Ion',
    lastName: 'Popescu',
    phone: '+40712345678',
  },
  address: {
    line1: 'Strada Lungă 5',
    city: 'Brașov',
    lat: 45.65,
    lng: 25.6,
  },
  paymentMethod: 'CARD',
};

function makeAdminMock() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const make = (data: any) => ({
    select: () => ({
      single: async () => ({ data, error: null }),
      eq: () => ({ select: async () => ({ data: [{ id: data.id }], error: null }) }),
    }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromHandler = (table: string): any => {
    if (table === 'customers') {
      return { insert: () => make({ id: 'cust-1' }) };
    }
    if (table === 'customer_addresses') {
      return { insert: () => make({ id: 'addr-1' }) };
    }
    if (table === 'restaurant_orders') {
      return {
        insert: () =>
          make({
            id: 'order-abc-12345',
            public_track_token: 'tok-xyz',
            total_ron: '42.50',
          }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    }
    return { insert: () => make({}) };
  };
  return { from: fromHandler, rpc: vi.fn() };
}

// ───── Tests ──────────────────────────────────────────────────────────

describe('POST /api/checkout/intent — Netopia/Viva provider router', () => {
  beforeEach(async () => {
    mockedCreateCheckoutSession.mockReset();
    process.env.ALLOWED_ORIGINS = ALLOWED;
    const tenant = await import('@/lib/tenant');
    (tenant.resolveTenantFromHost as ReturnType<typeof vi.fn>).mockResolvedValue({
      tenant: FAKE_TENANT,
      host: 'demo.hir.ro',
      slug: 'demo',
    });
    const pricing = await import('../pricing');
    (pricing.computeQuote as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      quote: {
        lineItems: [
          {
            itemId: '11111111-1111-1111-1111-111111111111',
            name: 'Pizza',
            priceRon: 21.25,
            quantity: 2,
            lineTotalRon: 42.5,
            modifiers: [],
          },
        ],
        subtotalRon: '42.50',
        deliveryFeeRon: '0.00',
        discountRon: '0.00',
        totalRon: '42.50',
        fulfillment: 'DELIVERY',
        distanceKm: 1.2,
        zoneId: null,
        tierId: null,
        promo: null,
      },
    });
    supabaseAdminFactory.mockReturnValue(makeAdminMock());
    mockedCreateCheckoutSession.mockResolvedValue({
      ok: true,
      provider: 'netopia',
      sessionId: 'np_order-abc-12345',
      url: 'https://secure.sandbox.netopia-payments.com/payment/card/start?ref=np_order-abc-12345',
    });
  });

  afterEach(() => {
    delete process.env.ALLOWED_ORIGINS;
    vi.clearAllMocks();
  });

  it('calls the provider router with order data and returns the hosted URL', async () => {
    const { POST } = await import('./route');
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      orderId: string;
      paymentMethod: string;
      url: string;
      provider: string;
      publicTrackToken: string;
    };
    expect(json.paymentMethod).toBe('CARD');
    expect(json.provider).toBe('netopia');
    expect(json.url).toContain('secure.sandbox.netopia-payments.com');
    expect(json.orderId).toBe('order-abc-12345');
    expect(json.publicTrackToken).toBe('tok-xyz');

    expect(mockedCreateCheckoutSession).toHaveBeenCalledTimes(1);
    const [provider, mode, input] = mockedCreateCheckoutSession.mock.calls[0];
    // Default (flag off): provider defaults to 'netopia', mode resolves to card_live.
    expect(provider).toBe('netopia');
    expect(mode).toBe('card_live');
    // 42.50 RON → 4250 bani.
    expect(input.amountBani).toBe(4250);
    expect(input.currency).toBe('RON');
    expect(input.orderId).toBe('order-abc-12345');
    expect(input.successUrl).toContain('https://demo.hir.ro/checkout/success');
    expect(input.successUrl).toContain('order_id=order-abc-12345');
    expect(input.successUrl).toContain('token=tok-xyz');
    expect(input.cancelUrl).toContain('https://demo.hir.ro/checkout/cancel');
    expect(input.metadata.order_id).toBe('order-abc-12345');
    expect(input.metadata.tenant_id).toBe('t1');
  });

  it('does NOT call the provider router for COD orders', async () => {
    const { POST } = await import('./route');
    const codBody = { ...VALID_BODY, paymentMethod: 'COD' };
    const res = await POST(makeReq(codBody));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { paymentMethod: string; url?: string };
    expect(json.paymentMethod).toBe('COD');
    expect(json.url).toBeUndefined();
    expect(mockedCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('routes card_sandbox + provider=netopia to the Netopia adapter', async () => {
    process.env.PSP_TENANT_TOGGLE_ENABLED = 'true';
    const tenant = await import('@/lib/tenant');
    (tenant.resolveTenantFromHost as ReturnType<typeof vi.fn>).mockResolvedValue({
      tenant: {
        ...FAKE_TENANT,
        settings: {
          ...FAKE_TENANT.settings,
          payments: { mode: 'card_sandbox', provider: 'netopia' },
        },
      },
      host: 'demo.hir.ro',
      slug: 'demo',
    });
    const { POST } = await import('./route');
    const res = await POST(makeReq(VALID_BODY));
    delete process.env.PSP_TENANT_TOGGLE_ENABLED;
    expect(res.status).toBe(200);
    expect(mockedCreateCheckoutSession).toHaveBeenCalledWith(
      'netopia',
      'card_sandbox',
      expect.any(Object),
    );
  });

  it('routes card_sandbox + provider=viva to the Viva adapter', async () => {
    process.env.PSP_TENANT_TOGGLE_ENABLED = 'true';
    mockedCreateCheckoutSession.mockResolvedValueOnce({
      ok: true,
      provider: 'viva',
      sessionId: 'vv_order-abc-12345',
      url: 'https://demo.vivapayments.com/web/checkout?ref=vv_order-abc-12345',
    });
    const tenant = await import('@/lib/tenant');
    (tenant.resolveTenantFromHost as ReturnType<typeof vi.fn>).mockResolvedValue({
      tenant: {
        ...FAKE_TENANT,
        settings: {
          ...FAKE_TENANT.settings,
          payments: { mode: 'card_sandbox', provider: 'viva' },
        },
      },
      host: 'demo.hir.ro',
      slug: 'demo',
    });
    const { POST } = await import('./route');
    const res = await POST(makeReq(VALID_BODY));
    delete process.env.PSP_TENANT_TOGGLE_ENABLED;
    expect(res.status).toBe(200);
    expect(mockedCreateCheckoutSession).toHaveBeenCalledWith(
      'viva',
      'card_sandbox',
      expect.any(Object),
    );
    const json = (await res.json()) as { provider: string; url: string };
    expect(json.provider).toBe('viva');
    expect(json.url).toContain('vivapayments.com');
  });

  it('returns 502 psp_unavailable when the adapter refuses', async () => {
    mockedCreateCheckoutSession.mockResolvedValueOnce({
      ok: false,
      provider: 'netopia',
      error: 'netopia_live_not_implemented',
    });
    const { POST } = await import('./route');
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: string; provider: string };
    expect(json.error).toBe('psp_unavailable');
    expect(json.provider).toBe('netopia');
  });
});
