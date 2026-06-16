// Integration tests for GET + POST /api/webhooks/viva
//
// Covers:
//   - Feature-flag gate (503 when VIVA_ENABLED unset)
//   - GET handshake returns { key } or 503 when key missing
//   - POST: signature rejection returns 400
//   - POST: duplicate event returns 200 duplicate:true
//   - POST: payment.captured triggers markOrderPaidAndDispatch + updates psp_payments to CAPTURED
//   - POST: payment.failed triggers markOrderPaymentFailed
//   - POST: payment.refunded updates payment_status to REFUNDED
//   - POST: already-CAPTURED psp_payments row → skip dispatch (duplicate:true)
//   - POST: missing psp_payments row returns 200 (best-effort)
//   - POST: side-effect exceptions are swallowed (returns 200)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORDER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PROVIDER_REF = 'VIVA-TXN-789';
const WEBHOOK_KEY = 'test-viva-webhook-key';

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
          // Chainable so it covers BOTH update shapes the route uses post-TOCTOU fix:
          //   captured/authorized: .update().eq().eq().eq().select('id')  (CAS claim)
          //   failed/refunded:     .update().eq().eq()                    (awaited)
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

// Mock the adapter so we control verifyWebhook output without real Bearer checks
vi.mock('@hir/integration-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@hir/integration-core')>();
  return {
    ...original,
    vivaAdapter: {
      ...original.vivaAdapter,
      verifyWebhook: vi.fn(),
    },
  };
});

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
}));

import { vivaAdapter } from '@hir/integration-core';
import { GET, POST } from './route';

const verifyWebhookMock = vi.mocked(vivaAdapter.verifyWebhook);

function makePostReq(body: string) {
  return new Request('http://localhost/api/webhooks/viva', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${WEBHOOK_KEY}` },
    body,
  });
}

describe('GET /api/webhooks/viva — Viva endpoint handshake', () => {
  beforeEach(() => {
    process.env.VIVA_ENABLED = 'true';
    process.env.VIVA_WEBHOOK_KEY = WEBHOOK_KEY;
  });
  afterEach(() => {
    delete process.env.VIVA_ENABLED;
    delete process.env.VIVA_WEBHOOK_KEY;
  });

  it('returns 503 when VIVA_ENABLED is not set', async () => {
    delete process.env.VIVA_ENABLED;
    const res = await GET(new Request('http://localhost/api/webhooks/viva'));
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('viva_not_enabled');
  });

  it('returns 503 when VIVA_WEBHOOK_KEY is missing', async () => {
    delete process.env.VIVA_WEBHOOK_KEY;
    const res = await GET(new Request('http://localhost/api/webhooks/viva'));
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('viva_webhook_key_missing');
  });

  it('returns { key } on valid handshake', async () => {
    const res = await GET(new Request('http://localhost/api/webhooks/viva'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { key: string };
    expect(json.key).toBe(WEBHOOK_KEY);
  });
});

describe('POST /api/webhooks/viva', () => {
  beforeEach(() => {
    process.env.VIVA_ENABLED = 'true';
    process.env.VIVA_WEBHOOK_KEY = WEBHOOK_KEY;
    insertMock.mockResolvedValue({ error: null });
    pspPaymentsSelectMock.mockResolvedValue({ data: { order_id: ORDER_ID, status: 'PENDING' } });
    // CAS claim winner (post-TOCTOU fix mirroring Netopia): UPDATE ... RETURNING id
    pspPaymentsUpdateMock.mockResolvedValue({ data: [{ id: 'claim-1' }], error: null });
    ordersUpdateMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    delete process.env.VIVA_ENABLED;
    delete process.env.VIVA_WEBHOOK_KEY;
    vi.clearAllMocks();
  });

  it('returns 503 when VIVA_ENABLED is not set', async () => {
    delete process.env.VIVA_ENABLED;
    const res = await POST(makePostReq('{}'));
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('viva_not_enabled');
  });

  it('returns 400 when verifyWebhook returns null (invalid signature)', async () => {
    verifyWebhookMock.mockResolvedValue(null);
    const res = await POST(makePostReq('{}'));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_or_unmapped');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('returns 200 duplicate:true on UNIQUE constraint violation', async () => {
    verifyWebhookMock.mockResolvedValue({
      kind: 'payment.captured',
      providerRef: PROVIDER_REF,
      amountBani: 10000,
      eventId: 'txn-dup',
    });
    insertMock.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } });
    const res = await POST(makePostReq(JSON.stringify({ EventTypeId: 1796 })));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: boolean; duplicate: boolean };
    expect(json.duplicate).toBe(true);
    expect(markOrderPaidAndDispatchMock).not.toHaveBeenCalled();
  });

  it('payment.captured → calls markOrderPaidAndDispatch and updates psp_payments to CAPTURED', async () => {
    verifyWebhookMock.mockResolvedValue({
      kind: 'payment.captured',
      providerRef: PROVIDER_REF,
      amountBani: 10000,
      eventId: 'txn-captured',
    });
    const res = await POST(makePostReq(JSON.stringify({ EventTypeId: 1796 })));
    expect(res.status).toBe(200);
    expect(markOrderPaidAndDispatchMock).toHaveBeenCalledOnce();
    expect(markOrderPaidAndDispatchMock).toHaveBeenCalledWith(ORDER_ID);
    expect(markOrderPaymentFailedMock).not.toHaveBeenCalled();
    expect(pspPaymentsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CAPTURED' }),
    );
  });

  it('skips dispatch when psp_payments.status is already CAPTURED (duplicate webhook)', async () => {
    verifyWebhookMock.mockResolvedValue({
      kind: 'payment.captured',
      providerRef: PROVIDER_REF,
      amountBani: 10000,
      eventId: 'txn-already-captured',
    });
    pspPaymentsSelectMock.mockResolvedValue({ data: { order_id: ORDER_ID, status: 'CAPTURED' } });
    const res = await POST(makePostReq(JSON.stringify({ EventTypeId: 1796 })));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: boolean; duplicate: boolean };
    expect(json.duplicate).toBe(true);
    expect(markOrderPaidAndDispatchMock).not.toHaveBeenCalled();
  });

  it('payment.failed → calls markOrderPaymentFailed', async () => {
    verifyWebhookMock.mockResolvedValue({
      kind: 'payment.failed',
      providerRef: PROVIDER_REF,
      reason: 'E13',
      eventId: 'txn-failed',
    });
    const res = await POST(makePostReq(JSON.stringify({ EventTypeId: 1798 })));
    expect(res.status).toBe(200);
    expect(markOrderPaymentFailedMock).toHaveBeenCalledWith(ORDER_ID);
    expect(markOrderPaidAndDispatchMock).not.toHaveBeenCalled();
  });

  it('payment.refunded → updates restaurant_orders payment_status to REFUNDED', async () => {
    verifyWebhookMock.mockResolvedValue({
      kind: 'payment.refunded',
      providerRef: PROVIDER_REF,
      amountBani: 10000,
      eventId: 'txn-refunded',
    });
    const res = await POST(makePostReq(JSON.stringify({ EventTypeId: 1797 })));
    expect(res.status).toBe(200);
    expect(ordersUpdateMock).toHaveBeenCalledWith({ payment_status: 'REFUNDED' });
    expect(markOrderPaidAndDispatchMock).not.toHaveBeenCalled();
  });

  it('returns 200 with no side-effects when no psp_payments row exists for provider_ref', async () => {
    verifyWebhookMock.mockResolvedValue({
      kind: 'payment.captured',
      providerRef: 'UNKNOWN_VIVA_REF',
      amountBani: 10000,
      eventId: 'txn-unknown',
    });
    pspPaymentsSelectMock.mockResolvedValue({ data: null });
    const res = await POST(makePostReq(JSON.stringify({ EventTypeId: 1796 })));
    expect(res.status).toBe(200);
    expect(markOrderPaidAndDispatchMock).not.toHaveBeenCalled();
  });

  it('returns 200 even when markOrderPaidAndDispatch throws (no retry storm)', async () => {
    verifyWebhookMock.mockResolvedValue({
      kind: 'payment.captured',
      providerRef: PROVIDER_REF,
      amountBani: 10000,
      eventId: 'txn-boom',
    });
    markOrderPaidAndDispatchMock.mockRejectedValueOnce(new Error('supabase down'));
    const res = await POST(makePostReq(JSON.stringify({ EventTypeId: 1796 })));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: boolean };
    expect(json.received).toBe(true);
  });
});
