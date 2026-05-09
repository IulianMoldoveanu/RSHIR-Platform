// Regression tests for POST /api/webhooks/courier — inbound HMAC-signed
// webhook from the RSHIR courier app. The route is on the order critical
// path (DISPATCHED → IN_DELIVERY → DELIVERED transitions arrive here)
// and is security-gated by an HMAC-SHA256 signature. Locking the security
// behaviour + status-mapping + terminal-state guard into tests is the
// highest-leverage coverage we can add against silent regressions.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';

const VALID_ORDER_ID = '33333333-3333-3333-3333-333333333333';
const SECRET = 'test-courier-webhook-secret';

// --- mocks ---

const orderSelectMock = vi.fn();
const orderUpdateMock = vi.fn();
const dispatchOrderEventMock = vi.fn(async () => undefined);

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(orderSelectMock(table)),
        }),
      }),
      update: (patch: unknown) => ({
        eq: (col: string, val: unknown) =>
          Promise.resolve(orderUpdateMock(table, patch, { col, val })),
      }),
    }),
  }),
}));

vi.mock('@/lib/integration-bus', () => ({
  dispatchOrderEvent: (...args: unknown[]) => dispatchOrderEventMock(...(args as [])),
}));

import { POST } from './route';

function sign(body: string, secret: string = SECRET): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeReq(rawBody: string, signature: string | null) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature !== null) headers['x-courier-signature'] = signature;
  return new Request('http://localhost/api/webhooks/courier', {
    method: 'POST',
    headers,
    body: rawBody,
  });
}

describe('POST /api/webhooks/courier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COURIER_WEBHOOK_SECRET = SECRET;
    dispatchOrderEventMock.mockClear();
  });
  afterEach(() => {
    delete process.env.COURIER_WEBHOOK_SECRET;
    vi.resetAllMocks();
  });

  it('returns 503 webhook_not_configured when secret is unset', async () => {
    delete process.env.COURIER_WEBHOOK_SECRET;
    const body = JSON.stringify({ externalOrderId: VALID_ORDER_ID, status: 'ACCEPTED' });
    const res = await POST(makeReq(body, sign(body)));
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('webhook_not_configured');
    expect(orderSelectMock).not.toHaveBeenCalled();
  });

  it('returns 401 invalid_signature when signature header is missing', async () => {
    const body = JSON.stringify({ externalOrderId: VALID_ORDER_ID, status: 'ACCEPTED' });
    const res = await POST(makeReq(body, null));
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_signature');
    expect(orderSelectMock).not.toHaveBeenCalled();
  });

  it('returns 401 invalid_signature when signature is malformed', async () => {
    const body = JSON.stringify({ externalOrderId: VALID_ORDER_ID, status: 'ACCEPTED' });
    const res = await POST(makeReq(body, 'sha256=zzz'));
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_signature');
  });

  it('returns 401 invalid_signature when signature is computed against wrong secret', async () => {
    const body = JSON.stringify({ externalOrderId: VALID_ORDER_ID, status: 'ACCEPTED' });
    const res = await POST(makeReq(body, sign(body, 'wrong-secret')));
    expect(res.status).toBe(401);
  });

  it('returns 400 invalid_json when body is not valid JSON (signature still verified first)', async () => {
    const body = 'not-json';
    const res = await POST(makeReq(body, sign(body)));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_json');
  });

  it('returns 400 invalid_event when payload fails schema validation', async () => {
    const body = JSON.stringify({ externalOrderId: 'not-a-uuid', status: 'ACCEPTED' });
    const res = await POST(makeReq(body, sign(body)));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_event');
  });

  it('accepts and ignores internal courier-only statuses (CREATED, OFFERED) without DB read', async () => {
    const body = JSON.stringify({ externalOrderId: VALID_ORDER_ID, status: 'OFFERED' });
    const res = await POST(makeReq(body, sign(body)));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; ignored: string };
    expect(json).toEqual({ ok: true, ignored: 'OFFERED' });
    // Critical: no DB read on courier-internal statuses (cheap fast path).
    expect(orderSelectMock).not.toHaveBeenCalled();
    expect(orderUpdateMock).not.toHaveBeenCalled();
    expect(dispatchOrderEventMock).not.toHaveBeenCalled();
  });

  it('returns 404 order_not_found when externalOrderId does not exist', async () => {
    orderSelectMock.mockReturnValue({ data: null, error: null });
    const body = JSON.stringify({ externalOrderId: VALID_ORDER_ID, status: 'ACCEPTED' });
    const res = await POST(makeReq(body, sign(body)));
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('order_not_found');
    expect(orderUpdateMock).not.toHaveBeenCalled();
    expect(dispatchOrderEventMock).not.toHaveBeenCalled();
  });

  it('ignores events when order is already in terminal DELIVERED state', async () => {
    orderSelectMock.mockReturnValue({
      data: { id: VALID_ORDER_ID, tenant_id: 'tenant-1', status: 'DELIVERED', payment_status: 'PAID' },
      error: null,
    });
    const body = JSON.stringify({ externalOrderId: VALID_ORDER_ID, status: 'ACCEPTED' });
    const res = await POST(makeReq(body, sign(body)));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; ignored: string };
    expect(json).toEqual({ ok: true, ignored: 'terminal_state' });
    expect(orderUpdateMock).not.toHaveBeenCalled();
    expect(dispatchOrderEventMock).not.toHaveBeenCalled();
  });

  it('ignores events when order is already in terminal CANCELLED state', async () => {
    orderSelectMock.mockReturnValue({
      data: { id: VALID_ORDER_ID, tenant_id: 'tenant-1', status: 'CANCELLED', payment_status: 'UNPAID' },
      error: null,
    });
    const body = JSON.stringify({ externalOrderId: VALID_ORDER_ID, status: 'DELIVERED' });
    const res = await POST(makeReq(body, sign(body)));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; ignored: string };
    expect(json.ignored).toBe('terminal_state');
    expect(orderUpdateMock).not.toHaveBeenCalled();
  });

  it('maps ACCEPTED → DISPATCHED, updates order, and dispatches status_changed', async () => {
    orderSelectMock.mockReturnValue({
      data: { id: VALID_ORDER_ID, tenant_id: 'tenant-1', status: 'CONFIRMED', payment_status: 'PAID' },
      error: null,
    });
    orderUpdateMock.mockReturnValue({ error: null });

    const body = JSON.stringify({ externalOrderId: VALID_ORDER_ID, status: 'ACCEPTED' });
    const res = await POST(makeReq(body, sign(body)));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; status: string };
    expect(json).toEqual({ ok: true, status: 'DISPATCHED' });

    expect(orderUpdateMock).toHaveBeenCalledTimes(1);
    const [table, patch] = orderUpdateMock.mock.calls[0];
    expect(table).toBe('restaurant_orders');
    expect(patch).toEqual({ status: 'DISPATCHED' });

    expect(dispatchOrderEventMock).toHaveBeenCalledTimes(1);
    const dispatchCall = dispatchOrderEventMock.mock.calls[0] as unknown as [
      string,
      string,
      { status: string },
    ];
    expect(dispatchCall[0]).toBe('tenant-1');
    expect(dispatchCall[1]).toBe('status_changed');
    expect(dispatchCall[2].status).toBe('DISPATCHED');
  });

  it('maps PICKED_UP → IN_DELIVERY', async () => {
    orderSelectMock.mockReturnValue({
      data: { id: VALID_ORDER_ID, tenant_id: 'tenant-1', status: 'DISPATCHED', payment_status: 'PAID' },
      error: null,
    });
    orderUpdateMock.mockReturnValue({ error: null });
    const body = JSON.stringify({ externalOrderId: VALID_ORDER_ID, status: 'PICKED_UP' });
    const res = await POST(makeReq(body, sign(body)));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe('IN_DELIVERY');
    expect(orderUpdateMock.mock.calls[0][1]).toEqual({ status: 'IN_DELIVERY' });
  });

  it('maps IN_TRANSIT → IN_DELIVERY (idempotent with PICKED_UP)', async () => {
    orderSelectMock.mockReturnValue({
      data: { id: VALID_ORDER_ID, tenant_id: 'tenant-1', status: 'IN_DELIVERY', payment_status: 'PAID' },
      error: null,
    });
    orderUpdateMock.mockReturnValue({ error: null });
    const body = JSON.stringify({ externalOrderId: VALID_ORDER_ID, status: 'IN_TRANSIT' });
    const res = await POST(makeReq(body, sign(body)));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe('IN_DELIVERY');
  });

  it('maps DELIVERED → DELIVERED', async () => {
    orderSelectMock.mockReturnValue({
      data: { id: VALID_ORDER_ID, tenant_id: 'tenant-1', status: 'IN_DELIVERY', payment_status: 'PAID' },
      error: null,
    });
    orderUpdateMock.mockReturnValue({ error: null });
    const body = JSON.stringify({ externalOrderId: VALID_ORDER_ID, status: 'DELIVERED' });
    const res = await POST(makeReq(body, sign(body)));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe('DELIVERED');
  });

  it('maps CANCELLED → CANCELLED, attaches reason to notes, dispatches cancelled event', async () => {
    orderSelectMock.mockReturnValue({
      data: { id: VALID_ORDER_ID, tenant_id: 'tenant-1', status: 'CONFIRMED', payment_status: 'PAID' },
      error: null,
    });
    orderUpdateMock.mockReturnValue({ error: null });

    const body = JSON.stringify({
      externalOrderId: VALID_ORDER_ID,
      status: 'CANCELLED',
      reason: 'driver-unreachable',
    });
    const res = await POST(makeReq(body, sign(body)));
    expect(res.status).toBe(200);

    const [, patch] = orderUpdateMock.mock.calls[0];
    expect(patch).toEqual({
      status: 'CANCELLED',
      notes: '[COURIER_CANCELLED] driver-unreachable',
    });

    expect(dispatchOrderEventMock).toHaveBeenCalledTimes(1);
    const cancelCall = dispatchOrderEventMock.mock.calls[0] as unknown as [
      string,
      string,
      { notes: string | null },
    ];
    expect(cancelCall[1]).toBe('cancelled');
    expect(cancelCall[2].notes).toBe('driver-unreachable');
  });

  it('returns 500 update_failed without leaking DB error details when the update errors', async () => {
    orderSelectMock.mockReturnValue({
      data: { id: VALID_ORDER_ID, tenant_id: 'tenant-1', status: 'CONFIRMED', payment_status: 'PAID' },
      error: null,
    });
    orderUpdateMock.mockReturnValue({ error: { message: 'constraint violated: courier_status_check' } });

    const body = JSON.stringify({ externalOrderId: VALID_ORDER_ID, status: 'ACCEPTED' });
    const res = await POST(makeReq(body, sign(body)));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('update_failed');
    // SECURITY: must not echo Supabase error.message — leaks column/constraint names.
    expect(JSON.stringify(json)).not.toContain('constraint');
    expect(JSON.stringify(json)).not.toContain('courier_status_check');
    expect(dispatchOrderEventMock).not.toHaveBeenCalled();
  });
});
