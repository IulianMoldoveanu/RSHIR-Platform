// Regression tests for /api/track/[token]/cancel — public, token-gated,
// anonymous customer self-cancel. Covers the state-machine guards, the
// race-loss path, and the not-found / invalid-token branches. The route
// has real security teeth (rate limit + token UUID + status guard +
// payment guard) so locking those into tests is high leverage.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const VALID_TOKEN = '11111111-1111-1111-1111-111111111111';

// --- mocks ---

const orderSelectMock = vi.fn();
const orderUpdateMock = vi.fn();
const auditInsertMock = vi.fn();

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve(orderSelectMock(table)),
        }),
      }),
      update: (patch: unknown) => ({
        eq: (col1: string, val1: unknown) => ({
          eq: (col2: string, val2: unknown) =>
            Promise.resolve(orderUpdateMock(table, patch, { col1, val1, col2, val2 })),
        }),
      }),
      insert: (row: unknown) => {
        auditInsertMock(table, row);
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

vi.mock('@/lib/integration-bus', () => ({
  dispatchOrderEvent: vi.fn(async () => undefined),
}));

// rate-limit shim: pass-through by default. Individual tests can override
// to simulate a 429.
type LimitResult = { ok: true } | { ok: false; retryAfterSec: number };
const checkLimitMock = vi.fn(
  (_key: string, _opts: unknown): LimitResult => ({ ok: true }),
);
vi.mock('@/lib/rate-limit', () => ({
  checkLimit: (key: string, opts: unknown) => checkLimitMock(key, opts),
  clientIp: () => '127.0.0.1',
}));

import { POST } from './route';

function makeReq() {
  return new NextRequest('http://localhost/api/track/' + VALID_TOKEN + '/cancel', {
    method: 'POST',
  });
}

describe('POST /api/track/[token]/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkLimitMock.mockReturnValue({ ok: true });
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns 429 when rate-limited', async () => {
    checkLimitMock.mockReturnValue({ ok: false, retryAfterSec: 60 });
    const res = await POST(makeReq(), { params: Promise.resolve({ token: VALID_TOKEN }) });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('rate_limited');
    expect(orderSelectMock).not.toHaveBeenCalled();
  });

  it('returns 400 invalid_token for malformed UUID', async () => {
    const res = await POST(makeReq(), { params: Promise.resolve({ token: 'not-a-uuid' }) });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_token');
    expect(orderSelectMock).not.toHaveBeenCalled();
  });

  it('returns 404 not_found when token does not match any order', async () => {
    orderSelectMock.mockReturnValue({ data: null, error: null });
    const res = await POST(makeReq(), { params: Promise.resolve({ token: VALID_TOKEN }) });
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('not_found');
    expect(orderUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 409 invalid_state when order is past PENDING', async () => {
    orderSelectMock.mockReturnValue({
      data: {
        id: 'order-1',
        tenant_id: 'tenant-1',
        status: 'CONFIRMED',
        payment_status: 'UNPAID',
      },
      error: null,
    });
    const res = await POST(makeReq(), { params: Promise.resolve({ token: VALID_TOKEN }) });
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string; status: string };
    expect(json.error).toBe('invalid_state');
    expect(json.status).toBe('CONFIRMED');
    expect(orderUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 409 invalid_state when order is PENDING but already PAID', async () => {
    orderSelectMock.mockReturnValue({
      data: {
        id: 'order-1',
        tenant_id: 'tenant-1',
        status: 'PENDING',
        payment_status: 'PAID',
      },
      error: null,
    });
    const res = await POST(makeReq(), { params: Promise.resolve({ token: VALID_TOKEN }) });
    expect(res.status).toBe(409);
    expect(orderUpdateMock).not.toHaveBeenCalled();
  });

  it('cancels happy path and writes audit + status update', async () => {
    orderSelectMock.mockReturnValue({
      data: {
        id: 'order-1',
        tenant_id: 'tenant-1',
        status: 'PENDING',
        payment_status: 'UNPAID',
      },
      error: null,
    });
    orderUpdateMock.mockReturnValue({ error: null });
    const res = await POST(makeReq(), { params: Promise.resolve({ token: VALID_TOKEN }) });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; status: string };
    expect(json).toEqual({ ok: true, status: 'CANCELLED' });

    // Update payload: status flipped to CANCELLED, scoped by id + status guard.
    expect(orderUpdateMock).toHaveBeenCalledTimes(1);
    const [table, patch, scope] = orderUpdateMock.mock.calls[0];
    expect(table).toBe('restaurant_orders');
    expect(patch).toMatchObject({ status: 'CANCELLED', notes: '[SELF-CANCEL]' });
    // The race-safe WHERE clause must keep the status='PENDING' guard.
    expect(scope).toEqual({
      col1: 'id',
      val1: 'order-1',
      col2: 'status',
      val2: 'PENDING',
    });

    // Audit row: anonymous actor, source=self-cancel.
    expect(auditInsertMock).toHaveBeenCalledTimes(1);
    const [auditTable, auditRow] = auditInsertMock.mock.calls[0];
    expect(auditTable).toBe('audit_log');
    expect(auditRow).toMatchObject({
      tenant_id: 'tenant-1',
      actor_user_id: null,
      action: 'order.cancelled',
      entity_type: 'order',
      entity_id: 'order-1',
      metadata: { source: 'self-cancel', from: 'PENDING' },
    });
  });

  it('returns 500 cancel_failed when DB update errors (race or constraint)', async () => {
    orderSelectMock.mockReturnValue({
      data: {
        id: 'order-1',
        tenant_id: 'tenant-1',
        status: 'PENDING',
        payment_status: 'UNPAID',
      },
      error: null,
    });
    orderUpdateMock.mockReturnValue({ error: { message: 'race-loss' } });
    const res = await POST(makeReq(), { params: Promise.resolve({ token: VALID_TOKEN }) });
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('cancel_failed');
    // SECURITY: must not echo the DB error.message to anonymous callers.
    expect(JSON.stringify(json)).not.toContain('race-loss');
  });

  it('does not call POS dispatcher on a failed cancel', async () => {
    const bus = await import('@/lib/integration-bus');
    orderSelectMock.mockReturnValue({
      data: {
        id: 'order-1',
        tenant_id: 'tenant-1',
        status: 'PENDING',
        payment_status: 'UNPAID',
      },
      error: null,
    });
    orderUpdateMock.mockReturnValue({ error: { message: 'race-loss' } });
    await POST(makeReq(), { params: Promise.resolve({ token: VALID_TOKEN }) });
    expect(bus.dispatchOrderEvent).not.toHaveBeenCalled();
  });
});
