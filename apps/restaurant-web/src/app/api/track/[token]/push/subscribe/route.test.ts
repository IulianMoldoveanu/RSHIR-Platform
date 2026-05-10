// Tests for POST /api/track/[token]/push/subscribe — public, token-gated,
// anonymous customer push-opt-in. Covers: rate-limit, invalid token,
// status guard (post-delivery → 409), and happy path with correct upsert shape.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const VALID_TOKEN = '22222222-2222-2222-2222-222222222222';

// --- mocks ---

const orderSelectSingleMock = vi.fn();
const upsertMock = vi.fn();

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'restaurant_orders') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve(orderSelectSingleMock(table)),
            }),
          }),
        };
      }
      // customer_push_subscriptions
      return {
        upsert: (row: unknown, opts: unknown) =>
          Promise.resolve(upsertMock(table, row, opts)),
      };
    },
  }),
}));

type LimitResult = { ok: true } | { ok: false; retryAfterSec: number };
const checkLimitMock = vi.fn((_key: string, _opts: unknown): LimitResult => ({ ok: true }));
vi.mock('@/lib/rate-limit', () => ({
  checkLimit: (key: string, opts: unknown) => checkLimitMock(key, opts),
  clientIp: () => '127.0.0.1',
}));

import { POST } from './route';

const VALID_BODY = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: {
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtLbEdLcSMxVWy6xF2T3pR-4',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
};

function makeReq(body: unknown = VALID_BODY) {
  return new NextRequest(
    `http://localhost/api/track/${VALID_TOKEN}/push/subscribe`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

describe('POST /api/track/[token]/push/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkLimitMock.mockReturnValue({ ok: true });
    upsertMock.mockReturnValue({ error: null });
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
    expect(orderSelectSingleMock).not.toHaveBeenCalled();
  });

  it('returns 400 invalid_token for non-UUID token', async () => {
    const res = await POST(makeReq(), { params: Promise.resolve({ token: 'not-a-uuid' }) });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_token');
    expect(orderSelectSingleMock).not.toHaveBeenCalled();
  });

  it('returns 404 not_found when token does not match any order', async () => {
    orderSelectSingleMock.mockReturnValue({ data: null, error: null });
    const res = await POST(makeReq(), { params: Promise.resolve({ token: VALID_TOKEN }) });
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('not_found');
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('returns 409 order_not_active when order status is DELIVERED', async () => {
    orderSelectSingleMock.mockReturnValue({
      data: { id: 'order-1', tenant_id: 'tenant-1', status: 'DELIVERED' },
      error: null,
    });
    const res = await POST(makeReq(), { params: Promise.resolve({ token: VALID_TOKEN }) });
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string; status: string };
    expect(json.error).toBe('order_not_active');
    expect(json.status).toBe('DELIVERED');
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('returns 409 order_not_active when order status is CANCELLED', async () => {
    orderSelectSingleMock.mockReturnValue({
      data: { id: 'order-1', tenant_id: 'tenant-1', status: 'CANCELLED' },
      error: null,
    });
    const res = await POST(makeReq(), { params: Promise.resolve({ token: VALID_TOKEN }) });
    expect(res.status).toBe(409);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('happy path: upserts subscription with tenant_id from order, not body', async () => {
    orderSelectSingleMock.mockReturnValue({
      data: { id: 'order-abc', tenant_id: 'tenant-xyz', status: 'PREPARING' },
      error: null,
    });

    const res = await POST(makeReq(), { params: Promise.resolve({ token: VALID_TOKEN }) });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json).toEqual({ ok: true });

    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [table, row, opts] = upsertMock.mock.calls[0];
    expect(table).toBe('customer_push_subscriptions');
    expect(row).toMatchObject({
      tenant_id: 'tenant-xyz',   // from order, never from body
      order_id: 'order-abc',
      endpoint: VALID_BODY.endpoint,
      p256dh: VALID_BODY.keys.p256dh,
      auth: VALID_BODY.keys.auth,
    });
    // Upsert must be conflict-safe on (order_id, endpoint).
    expect(opts).toMatchObject({ onConflict: 'order_id,endpoint' });
  });

  it('returns 400 invalid_body when endpoint is not a URL', async () => {
    const res = await POST(
      makeReq({ endpoint: 'not-a-url', keys: VALID_BODY.keys }),
      { params: Promise.resolve({ token: VALID_TOKEN }) },
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_body');
    expect(orderSelectSingleMock).not.toHaveBeenCalled();
  });

  it('returns 400 invalid_body when keys are missing', async () => {
    const res = await POST(
      makeReq({ endpoint: 'https://push.example.com/abc' }),
      { params: Promise.resolve({ token: VALID_TOKEN }) },
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_body');
  });

  it('returns 500 subscribe_failed when upsert errors', async () => {
    orderSelectSingleMock.mockReturnValue({
      data: { id: 'order-abc', tenant_id: 'tenant-xyz', status: 'CONFIRMED' },
      error: null,
    });
    upsertMock.mockReturnValue({ error: { message: 'constraint violation' } });

    const res = await POST(makeReq(), { params: Promise.resolve({ token: VALID_TOKEN }) });
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('subscribe_failed');
    // SECURITY: must not echo raw DB error to anonymous caller.
    expect(JSON.stringify(json)).not.toContain('constraint violation');
  });
});
