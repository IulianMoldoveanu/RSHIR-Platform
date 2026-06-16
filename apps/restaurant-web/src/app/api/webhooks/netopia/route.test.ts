// Integration tests for POST /api/webhooks/netopia
//
// Covers:
//   - Feature-flag gate (503 when NETOPIA_ENABLED unset)
//   - Signature rejection returns 400 (not 401 — PSPs should stop retrying)
//   - Duplicate event returns 200 duplicate:true (idempotency)
//   - payment.captured triggers markOrderPaidAndDispatch + updates psp_payments to CAPTURED
//   - payment.authorized triggers markOrderPaidAndDispatch (Netopia v2 auto-capture)
//   - payment.failed triggers markOrderPaymentFailed
//   - payment.refunded updates payment_status to REFUNDED
//   - Already-CAPTURED psp_payments row → skip dispatch (duplicate:true)
//   - Missing psp_payments row returns 200 (best-effort, logs warning)
//   - Side-effect exceptions are swallowed (returns 200, no retry storm)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORDER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROVIDER_REF = 'NTP123456';
const WEBHOOK_SECRET = 'test-netopia-secret';

// --- mock psp_webhook_events insert ---
const insertMock = vi.fn();
// --- mock psp_payments lookup ---
const pspPaymentsSelectMock = vi.fn();
// --- mock psp_payments status update ---
const pspPaymentsUpdateMock = vi.fn();
// --- mock restaurant_orders update (for refunded path) ---
const ordersUpdateMock = vi.fn();

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'psp_webhook_events') {
        return { insert: (row: unknown) => Promise.resolve(insertMock(row)) };
      }
      if (table === 'psp_payments') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve(pspPaymentsSelectMock()),
              }),
            }),
          }),
          // Chainable so it covers BOTH update shapes the route uses:
          //   captured/authorized: .update().eq().eq().eq().select('id')  (CAS claim)
          //   failed/refunded:     .update().eq().eq()  (awaited)
          // `then` makes the chain awaitable; `select` resolves the claim.
          update: (patch: unknown) => {
            const exec = () => Promise.resolve(pspPaymentsUpdateMock(patch));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const chain: any = {
              eq: () => chain,
              select: () => exec(),
              then: (onF: (v: unknown) => unknown, onR: (e: unknown) => unknown) =>
                exec().then(onF, onR),
            };
            return chain;
          },
        };
      }
      if (table === 'restaurant_orders') {
        return {
          update: (patch: unknown) => ({
            eq: () => ({
              eq: () => Promise.resolve(ordersUpdateMock(patch)),
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

const markOrderPaidAndDispatchMock = vi.fn(async () => undefined);
const markOrderPaymentFailedMock = vi.fn(async () => undefined);

vi.mock('@/app/api/checkout/order-finalize', () => ({
  markOrderPaidAndDispatch: (...args: unknown[]) => markOrderPaidAndDispatchMock(...(args as [])),
  markOrderPaymentFailed: (...args: unknown[]) => markOrderPaymentFailedMock(...(args as [])),
}));

// Mock the adapter so we control verifyWebhook output without real HMAC
vi.mock('@hir/integration-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@hir/integration-core')>();
  return {
    ...original,
    netopiaAdapter: {
      ...original.netopiaAdapter,
      verifyWebhook: vi.fn(),
    },
  };
});

// Sentry surface is shared across PSP webhook + checkout tests; the central
// mock at apps/restaurant-web/__mocks__/@sentry/nextjs.ts covers every method
// the routes use. See RCA rank 5 SENTRY-MOCK-CENTRALIZATION.
vi.mock('@sentry/nextjs');

import { netopiaAdapter } from '@hir/integration-core';
import { POST } from './route';

const verifyWebhookMock = vi.mocked(netopiaAdapter.verifyWebhook);

function makeReq(body: string) {
  return new Request('http://localhost/api/webhooks/netopia', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-netopia-signature': 'sig' },
    body,
  });
}

describe('POST /api/webhooks/netopia', () => {
  beforeEach(() => {
    process.env.NETOPIA_ENABLED = 'true';
    process.env.NETOPIA_WEBHOOK_SECRET = WEBHOOK_SECRET;
    insertMock.mockResolvedValue({ error: null });
    pspPaymentsSelectMock.mockResolvedValue({ data: { order_id: ORDER_ID, status: 'PENDING' } });
    // CAS claim returns a row (data.length > 0) so the captured/authorized path
    // proceeds to markOrderPaidAndDispatch. The TOCTOU fix (#929) bails when the
    // claim returns no rows.
    pspPaymentsUpdateMock.mockResolvedValue({ data: [{ id: 'claim-1' }], error: null });
    ordersUpdateMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    delete process.env.NETOPIA_ENABLED;
    delete process.env.NETOPIA_WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  it('returns 503 when NETOPIA_ENABLED is not set', async () => {
    delete process.env.NETOPIA_ENABLED;
    const res = await POST(makeReq('{}'));
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('netopia_not_enabled');
  });

  it('returns 400 when verifyWebhook returns null (invalid signature)', async () => {
    verifyWebhookMock.mockResolvedValue(null);
    const res = await POST(makeReq('{}'));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_or_unmapped');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('returns 200 duplicate:true on UNIQUE constraint violation', async () => {
    verifyWebhookMock.mockResolvedValue({
      kind: 'payment.captured',
      providerRef: PROVIDER_REF,
      amountBani: 5000,
      eventId: 'evt-1',
    });
    insertMock.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } });
    const res = await POST(makeReq(JSON.stringify({ payment: { ntpID: PROVIDER_REF, status: 5 } })));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: boolean; duplicate: boolean };
    expect(json.duplicate).toBe(true);
    expect(markOrderPaidAndDispatchMock).not.toHaveBeenCalled();
  });

  it('payment.captured → calls markOrderPaidAndDispatch and updates psp_payments to CAPTURED', async () => {
    verifyWebhookMock.mockResolvedValue({
      kind: 'payment.captured',
      providerRef: PROVIDER_REF,
      amountBani: 5000,
      eventId: 'evt-captured',
    });
    const res = await POST(makeReq(JSON.stringify({ payment: { ntpID: PROVIDER_REF, status: 5 } })));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: boolean };
    expect(json.received).toBe(true);
    expect(markOrderPaidAndDispatchMock).toHaveBeenCalledOnce();
    expect(markOrderPaidAndDispatchMock).toHaveBeenCalledWith(ORDER_ID);
    expect(markOrderPaymentFailedMock).not.toHaveBeenCalled();
    expect(pspPaymentsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CAPTURED' }),
    );
  });

  it('payment.authorized → calls markOrderPaidAndDispatch (Netopia v2 auto-capture)', async () => {
    verifyWebhookMock.mockResolvedValue({
      kind: 'payment.authorized',
      providerRef: PROVIDER_REF,
      amountBani: 5000,
      eventId: 'evt-auth',
    });
    const res = await POST(makeReq(JSON.stringify({ payment: { ntpID: PROVIDER_REF, status: 3 } })));
    expect(res.status).toBe(200);
    expect(markOrderPaidAndDispatchMock).toHaveBeenCalledWith(ORDER_ID);
    expect(pspPaymentsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CAPTURED' }),
    );
  });

  it('skips dispatch when psp_payments.status is already CAPTURED (duplicate webhook)', async () => {
    verifyWebhookMock.mockResolvedValue({
      kind: 'payment.captured',
      providerRef: PROVIDER_REF,
      amountBani: 5000,
      eventId: 'evt-already-captured',
    });
    pspPaymentsSelectMock.mockResolvedValue({ data: { order_id: ORDER_ID, status: 'CAPTURED' } });
    const res = await POST(makeReq(JSON.stringify({ payment: { ntpID: PROVIDER_REF, status: 5 } })));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: boolean; duplicate: boolean };
    expect(json.duplicate).toBe(true);
    expect(markOrderPaidAndDispatchMock).not.toHaveBeenCalled();
  });

  it('payment.failed → calls markOrderPaymentFailed', async () => {
    verifyWebhookMock.mockResolvedValue({
      kind: 'payment.failed',
      providerRef: PROVIDER_REF,
      reason: 'insufficient_funds',
      eventId: 'evt-failed',
    });
    const res = await POST(makeReq(JSON.stringify({ payment: { ntpID: PROVIDER_REF, status: 6 } })));
    expect(res.status).toBe(200);
    expect(markOrderPaymentFailedMock).toHaveBeenCalledWith(ORDER_ID);
    expect(markOrderPaidAndDispatchMock).not.toHaveBeenCalled();
  });

  it('payment.refunded → updates restaurant_orders payment_status to REFUNDED', async () => {
    verifyWebhookMock.mockResolvedValue({
      kind: 'payment.refunded',
      providerRef: PROVIDER_REF,
      amountBani: 5000,
      eventId: 'evt-refunded',
    });
    const res = await POST(makeReq(JSON.stringify({ payment: { ntpID: PROVIDER_REF, status: 7 } })));
    expect(res.status).toBe(200);
    expect(ordersUpdateMock).toHaveBeenCalledWith({ payment_status: 'REFUNDED' });
    expect(markOrderPaidAndDispatchMock).not.toHaveBeenCalled();
  });

  it('returns 200 with no side-effects when no psp_payments row exists for provider_ref', async () => {
    verifyWebhookMock.mockResolvedValue({
      kind: 'payment.captured',
      providerRef: 'UNKNOWN_REF',
      amountBani: 5000,
      eventId: 'evt-unknown',
    });
    pspPaymentsSelectMock.mockResolvedValue({ data: null });
    const res = await POST(makeReq(JSON.stringify({ payment: { ntpID: 'UNKNOWN_REF', status: 5 } })));
    expect(res.status).toBe(200);
    expect(markOrderPaidAndDispatchMock).not.toHaveBeenCalled();
  });

  it('returns 200 even when markOrderPaidAndDispatch throws (no retry storm)', async () => {
    verifyWebhookMock.mockResolvedValue({
      kind: 'payment.captured',
      providerRef: PROVIDER_REF,
      amountBani: 5000,
      eventId: 'evt-throws',
    });
    markOrderPaidAndDispatchMock.mockRejectedValueOnce(new Error('db exploded'));
    const res = await POST(makeReq(JSON.stringify({ payment: { ntpID: PROVIDER_REF, status: 5 } })));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: boolean };
    expect(json.received).toBe(true);
  });
});
