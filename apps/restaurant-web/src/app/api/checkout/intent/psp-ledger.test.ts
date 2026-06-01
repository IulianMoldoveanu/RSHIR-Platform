// Integration test: checkout/intent inserts a psp_payments ledger row after
// a successful createCheckoutSession, so the Netopia / Viva webhook handler
// can resolve order_id from provider_ref on payment.captured.
//
// This test drives the full CARD happy-path through the intent route with all
// dependencies mocked. It verifies:
//   1. psp_payments INSERT is called with correct fields (provider_ref, order_id,
//      tenant_id, provider, amount_bani, status='PENDING')
//   2. The response still returns orderId + url + provider as expected

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// -----------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------
const TENANT_ID = 'tttttttt-tttt-tttt-tttt-tttttttttttt';
const ORDER_ID = 'oooooooo-oooo-oooo-oooo-oooooooooooo';
const CUSTOMER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ADDRESS_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SESSION_ID = 'NTP-SESSION-REF-001';
const SESSION_URL = 'https://secure.sandbox.netopia-payments.com/pay/NTP-SESSION-REF-001';
const TRACK_TOKEN = 'pub-track-001';
const AMOUNT_RON = 55.0;
const AMOUNT_BANI = 5500;

// -----------------------------------------------------------------------
// Supabase mock — tracks psp_payments inserts
// -----------------------------------------------------------------------
const pspPaymentsInsertMock = vi.fn();

function makeSupabaseMock() {
  return {
    from: (table: string) => {
      if (table === 'customers') {
        return {
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: CUSTOMER_ID }, error: null }) }) }),
        };
      }
      if (table === 'customer_addresses') {
        return {
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: ADDRESS_ID }, error: null }) }) }),
        };
      }
      if (table === 'restaurant_orders') {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: ORDER_ID, public_track_token: TRACK_TOKEN, total_ron: AMOUNT_RON },
                  error: null,
                }),
            }),
          }),
          delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (table === 'psp_payments') {
        return {
          insert: (row: unknown) => Promise.resolve(pspPaymentsInsertMock(row)),
        };
      }
      if (table === 'checkout_idempotency') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
          insert: () => Promise.resolve({ error: null }),
        };
      }
      return { insert: () => Promise.resolve({ error: null }) };
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(() => makeSupabaseMock()),
}));

vi.mock('@/lib/tenant', () => ({
  resolveTenantFromHost: vi.fn(async () => ({
    tenant: {
      id: TENANT_ID,
      slug: 'demo',
      name: 'Demo',
      settings: { cod_enabled: false, payments: { mode: 'card_sandbox', provider: 'netopia' } },
    },
    host: 'demo.hir.ro',
    slug: 'demo',
  })),
  tenantBaseUrl: vi.fn(() => 'https://demo.hir.ro'),
}));

vi.mock('@/lib/operations', () => ({
  isAcceptingOrders: vi.fn(() => true),
  isOpenNow: vi.fn(() => ({ open: true, nextOpen: null })),
}));

vi.mock('@/lib/payment-mode', () => ({
  resolvePaymentSurface: vi.fn(() => ({
    mode: 'card_sandbox',
    provider: 'netopia',
    cardEnabled: true,
    codEnabled: false,
    showTestBanner: true,
  })),
  isPspTenantToggleEnabled: vi.fn(() => true),
}));

vi.mock('@/lib/payments/provider-router', () => ({
  createCheckoutSession: vi.fn(async () => ({
    ok: true,
    provider: 'netopia',
    sessionId: SESSION_ID,
    url: SESSION_URL,
  })),
}));

vi.mock('../pricing', () => ({
  computeQuote: vi.fn(async () => ({
    ok: true,
    quote: {
      lineItems: [{ name: 'Pizza', quantity: 1, priceRon: '50.00', lineTotalRon: '50.00', modifiers: [] }],
      subtotalRon: '50.00',
      deliveryFeeRon: '5.00',
      totalRon: String(AMOUNT_RON),
      discountRon: '0.00',
      fulfillment: 'DELIVERY',
      zoneId: null,
      tierId: null,
      promo: null,
    },
  })),
}));

vi.mock('@/lib/origin-check', () => ({
  assertSameOrigin: vi.fn(() => ({ ok: true })),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkLimit: vi.fn(() => ({ ok: true })),
  clientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/customer-recognition', () => ({
  maybeSetCustomerCookie: vi.fn(),
  readCustomerCookie: vi.fn(() => null),
}));

vi.mock('@/lib/integration-bus', () => ({
  dispatchOrderEvent: vi.fn(),
}));

vi.mock('@/lib/newsletter/checkout-optin', () => ({
  recordCheckoutSignup: vi.fn(),
  ensurePerEmailWelcomeCode: vi.fn(),
  sendCheckoutWelcomeEmail: vi.fn(),
}));

vi.mock('@/lib/loyalty', () => ({
  validateRedemption: vi.fn(),
}));

vi.mock('@/lib/i18n', () => ({
  LOCALE_COOKIE: 'hir_locale',
  isLocale: vi.fn(() => false),
  DEFAULT_LOCALE: 'ro',
}));

vi.mock('@/lib/idempotency', () => ({
  checkIdempotency: vi.fn(),
  hashRequestBody: vi.fn(() => 'hash'),
  readIdempotencyKey: vi.fn(() => null),
  storeIdempotency: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
}));

import { POST } from './route';

function makeCardReq() {
  return new NextRequest('http://localhost/api/checkout/intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://demo.hir.ro' },
    body: JSON.stringify({
      items: [{ itemId: '11111111-1111-1111-1111-111111111111', quantity: 1 }],
      fulfillment: 'DELIVERY',
      customer: { firstName: 'Ion', lastName: 'Pop', phone: '+40712345678' },
      address: { line1: 'Strada X 1', city: 'Brasov', lat: 45.6, lng: 25.6 },
      paymentMethod: 'CARD',
    }),
  });
}

describe('POST /api/checkout/intent — psp_payments ledger (P0 fix)', () => {
  beforeEach(() => {
    process.env.PSP_TENANT_TOGGLE_ENABLED = 'true';
    pspPaymentsInsertMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    delete process.env.PSP_TENANT_TOGGLE_ENABLED;
    vi.clearAllMocks();
  });

  it('inserts a psp_payments row with provider_ref = sessionId after successful PSP session', async () => {
    const res = await POST(makeCardReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { orderId: string; url: string; provider: string };
    expect(json.orderId).toBe(ORDER_ID);
    expect(json.url).toBe(SESSION_URL);
    expect(json.provider).toBe('netopia');

    expect(pspPaymentsInsertMock).toHaveBeenCalledOnce();
    expect(pspPaymentsInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        order_id: ORDER_ID,
        provider: 'netopia',
        provider_ref: SESSION_ID,
        amount_bani: AMOUNT_BANI,
        status: 'PENDING',
      }),
    );
  });

  it('returns 200 and continues when psp_payments insert fails (best-effort)', async () => {
    pspPaymentsInsertMock.mockResolvedValue({ error: { message: 'constraint violated' } });
    const res = await POST(makeCardReq());
    // The insert failure should not abort the checkout — response is still 200
    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string };
    expect(json.url).toBe(SESSION_URL);
  });
});
