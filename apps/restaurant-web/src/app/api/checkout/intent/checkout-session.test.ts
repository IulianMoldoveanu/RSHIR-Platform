// Lane J — verifies the migrated checkout flow uses Stripe Checkout Sessions
// (not PaymentIntents + Elements) and that the response shape is the
// `{ url, orderId, paymentMethod: 'CARD' }` triple the redesigned client
// expects. Mocks Supabase + Stripe; no real API calls.

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

const mockedSessionCreate = vi.fn();
vi.mock('@/lib/stripe/server', () => ({
  getStripe: vi.fn(() => ({
    checkout: { sessions: { create: mockedSessionCreate } },
  })),
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

// Single-shot Supabase admin mock: returns minimal happy-path responses
// for the chained calls in route.ts (customers insert → addresses insert →
// orders insert → orders update). vi.mocked chain stubs with `as any` to
// keep the test focused on the Stripe call assertion.
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

describe('POST /api/checkout/intent — Lane J Checkout Session', () => {
  beforeEach(async () => {
    // Reset the module-scope Stripe spy explicitly. `vi.clearAllMocks()` in
    // afterEach clears call history, but when the full suite runs the sibling
    // `route.test.ts` mocks the same `@/lib/stripe/server` module with a
    // different factory, which can leave this spy in an unknown call state on
    // some worker schedules. Explicit reset here is belt-and-braces.
    mockedSessionCreate.mockReset();
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
    mockedSessionCreate.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
    });
  });

  afterEach(() => {
    delete process.env.ALLOWED_ORIGINS;
    vi.clearAllMocks();
  });

  it('creates a Stripe Checkout Session (not a PaymentIntent) and returns the hosted URL', async () => {
    const { POST } = await import('./route');
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      orderId: string;
      paymentMethod: string;
      url: string;
      publicTrackToken: string;
    };
    expect(json.paymentMethod).toBe('CARD');
    expect(json.url).toBe('https://checkout.stripe.com/c/pay/cs_test_123');
    expect(json.orderId).toBe('order-abc-12345');
    expect(json.publicTrackToken).toBe('tok-xyz');

    expect(mockedSessionCreate).toHaveBeenCalledTimes(1);
    const [args, opts] = mockedSessionCreate.mock.calls[0];

    // Mode + payment method types
    expect(args.mode).toBe('payment');
    expect(args.payment_method_types).toEqual(['card']);

    // Single line item, RON, amount in bani (cents). 42.50 RON → 4250 bani.
    expect(args.line_items).toHaveLength(1);
    expect(args.line_items[0].quantity).toBe(1);
    expect(args.line_items[0].price_data.currency).toBe('ron');
    expect(args.line_items[0].price_data.unit_amount).toBe(4250);
    expect(args.line_items[0].price_data.product_data.name).toContain('Demo Restaurant');

    // success/cancel URLs use canonical tenant base + carry order_id.
    expect(args.success_url).toContain('https://demo.hir.ro/checkout/success');
    expect(args.success_url).toContain('order_id=order-abc-12345');
    expect(args.success_url).toContain('token=tok-xyz');
    expect(args.cancel_url).toContain('https://demo.hir.ro/checkout/cancel');
    expect(args.cancel_url).toContain('order_id=order-abc-12345');

    // Metadata on the Session AND propagated onto the inner PaymentIntent —
    // the webhook reads metadata.order_id off payment_intent.succeeded.
    expect(args.metadata.order_id).toBe('order-abc-12345');
    expect(args.metadata.tenant_id).toBe('t1');
    expect(args.payment_intent_data.metadata.order_id).toBe('order-abc-12345');
    expect(args.payment_intent_data.metadata.tenant_id).toBe('t1');

    // Idempotency keyed on order_id so a retried POST never creates a 2nd session.
    expect(opts).toEqual({ idempotencyKey: 'order:order-abc-12345' });
  });

  it('does NOT call Stripe Checkout Session for COD orders', async () => {
    const { POST } = await import('./route');
    const codBody = { ...VALID_BODY, paymentMethod: 'COD' };
    const res = await POST(makeReq(codBody));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { paymentMethod: string; url?: string };
    expect(json.paymentMethod).toBe('COD');
    expect(json.url).toBeUndefined();
    expect(mockedSessionCreate).not.toHaveBeenCalled();
  });
});
