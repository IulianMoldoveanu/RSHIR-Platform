// Smoke tests for the Stripe webhook receiver. The signature-verified happy
// path needs a real Stripe test key (or a vi.mock of getStripe()), but the
// 503/400 early returns are pure logic and worth pinning. Lane G adds
// coverage for the unhandled-event short-circuit and the idempotency-first
// flow ordering (event.id insert MUST happen before any side-effect call).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('../../checkout/order-finalize', () => ({
  markOrderPaidAndDispatch: vi.fn(),
  markOrderPaymentFailed: vi.fn(),
  markOrderRefunded: vi.fn(),
}));

vi.mock('@/lib/stripe/server', () => ({
  getStripe: vi.fn(),
}));

import { POST } from './route';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe/server';
import {
  markOrderPaidAndDispatch,
  markOrderPaymentFailed,
  markOrderRefunded,
} from '../../checkout/order-finalize';

function makeReq(init: { body?: string; signature?: string | null }) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.signature) headers['stripe-signature'] = init.signature;
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers,
    body: init.body ?? '{}',
  });
}

// Helper to build a Stripe stub whose constructEvent returns a synthetic
// event. Lets us bypass the real signature math without any test keys.
function stubStripeWithEvent(event: { id: string; type: string; data: { object: unknown } }) {
  vi.mocked(getStripe).mockReturnValue({
    webhooks: {
      constructEvent: () => event,
    },
  } as unknown as ReturnType<typeof getStripe>);
}

function stubAdminInsertOk() {
  const insert = vi.fn(async () => ({ error: null }));
  const del = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
  vi.mocked(getSupabaseAdmin).mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === 'stripe_events_processed') return { insert, delete: del };
      throw new Error('unexpected table: ' + table);
    }),
  } as unknown as ReturnType<typeof getSupabaseAdmin>);
  return { insert, del };
}

function stubAdminInsertDup() {
  const insert = vi.fn(async () => ({ error: { code: '23505', message: 'unique_violation' } }));
  vi.mocked(getSupabaseAdmin).mockReturnValue({
    from: vi.fn(() => ({ insert })),
  } as unknown as ReturnType<typeof getSupabaseAdmin>);
  return { insert };
}

describe('POST /api/webhooks/stripe', () => {
  beforeEach(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_unit_tests';
  });
  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('returns 503 webhook_not_configured when STRIPE_WEBHOOK_SECRET is unset', async () => {
    const res = await POST(makeReq({ body: '{}' }));
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('webhook_not_configured');
  });

  it('returns 400 missing_signature when stripe-signature header is absent', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    const res = await POST(makeReq({ body: '{}' }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('missing_signature');
  });

  it('returns 400 invalid_signature when the signature cannot be verified', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    vi.mocked(getStripe).mockReturnValue({
      webhooks: {
        constructEvent: () => {
          throw new Error('No signatures found matching the expected signature');
        },
      },
    } as unknown as ReturnType<typeof getStripe>);
    const res = await POST(makeReq({ body: '{}', signature: 't=1,v1=bogus' }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_signature');
  });

  it('short-circuits unhandled events with 200 + handled:false (no DB touch)', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    stubStripeWithEvent({
      id: 'evt_1',
      type: 'customer.created',
      data: { object: {} },
    });
    const res = await POST(makeReq({ body: '{}', signature: 't=1' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: boolean; handled: boolean };
    expect(json.handled).toBe(false);
    // Confirms we never touched the DB or the side-effect helpers.
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
    expect(markOrderPaidAndDispatch).not.toHaveBeenCalled();
  });

  it('processes payment_intent.succeeded once and dispatches the order', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    stubStripeWithEvent({
      id: 'evt_succ_1',
      type: 'payment_intent.succeeded',
      data: { object: { metadata: { order_id: 'order-123' } } },
    });
    const { insert } = stubAdminInsertOk();
    const res = await POST(makeReq({ body: '{}', signature: 't=1' }));
    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(markOrderPaidAndDispatch).toHaveBeenCalledWith('order-123');
  });

  it('returns 200 duplicate:true when the event id was already processed (23505)', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    stubStripeWithEvent({
      id: 'evt_dup',
      type: 'payment_intent.succeeded',
      data: { object: { metadata: { order_id: 'order-123' } } },
    });
    stubAdminInsertDup();
    const res = await POST(makeReq({ body: '{}', signature: 't=1' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { duplicate: boolean };
    expect(json.duplicate).toBe(true);
    // Critically, the side effect MUST NOT run for a duplicate event.
    expect(markOrderPaidAndDispatch).not.toHaveBeenCalled();
  });

  it('processes charge.refunded by passing payment_intent id to markOrderRefunded', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    stubStripeWithEvent({
      id: 'evt_refund_1',
      type: 'charge.refunded',
      data: { object: { payment_intent: 'pi_abc123' } },
    });
    stubAdminInsertOk();
    const res = await POST(makeReq({ body: '{}', signature: 't=1' }));
    expect(res.status).toBe(200);
    expect(markOrderRefunded).toHaveBeenCalledWith('pi_abc123');
  });

  it('processes payment_intent.payment_failed without auto-cancelling', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    stubStripeWithEvent({
      id: 'evt_fail_1',
      type: 'payment_intent.payment_failed',
      data: { object: { metadata: { order_id: 'order-456' } } },
    });
    stubAdminInsertOk();
    const res = await POST(makeReq({ body: '{}', signature: 't=1' }));
    expect(res.status).toBe(200);
    expect(markOrderPaymentFailed).toHaveBeenCalledWith('order-456');
    // Sanity: succeeded handler must NOT run.
    expect(markOrderPaidAndDispatch).not.toHaveBeenCalled();
  });

  it('rolls back the idempotency row when the side effect throws', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    stubStripeWithEvent({
      id: 'evt_throw_1',
      type: 'payment_intent.succeeded',
      data: { object: { metadata: { order_id: 'order-789' } } },
    });
    const { del } = stubAdminInsertOk();
    vi.mocked(markOrderPaidAndDispatch).mockRejectedValueOnce(new Error('db down'));
    const res = await POST(makeReq({ body: '{}', signature: 't=1' }));
    expect(res.status).toBe(500);
    // Stripe will retry; we must have un-claimed the event.id row.
    expect(del).toHaveBeenCalled();
  });
});
