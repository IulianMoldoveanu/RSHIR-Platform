// PATCH /api/public/v1/orders/:id/status
//
// This route is the hinge the whole own-site Connect flow turns on, and every
// one of its interesting cases is a way to get the money or the dispatch
// wrong rather than a way to get a 500. So the tests are about those:
//   · a storefront order must not be movable by an API key
//   · "completed" must never become a billable delivery
//   · READY must not silently dispatch nobody
// The DB is mocked at the admin-client boundary, with a single mutable row
// that honours the compare-and-set, so transitions are exercised for real.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const TENANT_ID = 'tenant-aaa';
const ORDER_ID = 'order-123';

const authMock = vi.fn();
vi.mock('../../../auth', () => ({
  authenticateBearerKey: (header: string | null) => authMock(header),
}));

type Row = { id: string; status: string; updated_at: string; source: string | null };
let orderRow: Row | null = null;
let applied: { from: string; to: string }[] = [];

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: orderRow, error: null }),
          }),
        }),
      }),
      update: (row: { status: string }) => ({
        eq: () => ({
          // Second .eq() is the compare-and-set guard on the current status.
          eq: (_col: string, fromStatus: string) => ({
            select: async () => {
              if (!orderRow || orderRow.status !== fromStatus) {
                return { data: [], error: null };
              }
              applied.push({ from: fromStatus, to: row.status });
              orderRow = {
                ...orderRow,
                status: row.status,
                updated_at: '2026-11-19T12:00:00.000Z',
              };
              return { data: [orderRow], error: null };
            },
          }),
        }),
      }),
    }),
  }),
}));

type LimitResult = { ok: true } | { ok: false; retryAfterSec: number };
const checkLimitMock = vi.fn((_k: string, _o: unknown): LimitResult => ({ ok: true }));
vi.mock('@/lib/rate-limit', () => ({
  checkLimit: (k: string, o: unknown) => checkLimitMock(k, o),
}));

import { PATCH } from './route';

function req(status: unknown, headers: Record<string, string> = { authorization: 'Bearer k' }) {
  return new Request(`http://localhost/api/public/v1/orders/${ORDER_ID}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ status }),
  });
}

const params = Promise.resolve({ id: ORDER_ID });

function seed(status: string, source: string | null = 'EXTERNAL_API') {
  orderRow = { id: ORDER_ID, status, updated_at: '2026-11-19T10:00:00.000Z', source };
}

describe('PATCH /api/public/v1/orders/:id/status', () => {
  beforeEach(() => {
    applied = [];
    checkLimitMock.mockReturnValue({ ok: true });
    authMock.mockResolvedValue({
      tenantId: TENANT_ID,
      keyId: 'key-1',
      scopes: ['orders.write', 'orders.read'],
    });
    seed('PENDING');
  });

  it('rejects a missing or invalid key', async () => {
    authMock.mockResolvedValue(null);
    const res = await PATCH(req('PREPARING'), { params });
    expect(res.status).toBe(401);
  });

  it('rejects a key without orders.write', async () => {
    authMock.mockResolvedValue({ tenantId: TENANT_ID, keyId: 'k', scopes: ['orders.read'] });
    const res = await PATCH(req('PREPARING'), { params });
    expect(res.status).toBe(401);
  });

  it('404s an order that is not this tenant’s', async () => {
    orderRow = null;
    const res = await PATCH(req('PREPARING'), { params });
    expect(res.status).toBe(404);
  });

  // The boundary between the two products: a vendor can run our storefront and
  // their own shop at once, and neither may reach into the other's orders.
  it('refuses to move an order our own storefront took', async () => {
    seed('PENDING', 'INTERNAL_STOREFRONT');
    const res = await PATCH(req('PREPARING'), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('order_not_api_managed');
    expect(applied).toEqual([]);
    expect(orderRow?.status).toBe('PENDING');
  });

  it('accepts a POS_PUSH order as well as EXTERNAL_API', async () => {
    seed('PENDING', 'POS_PUSH');
    const res = await PATCH(req('PREPARING'), { params });
    expect(res.status).toBe(200);
    expect(orderRow?.status).toBe('PREPARING');
  });

  // WooCommerce pushes its own slug straight from the status hook.
  it('understands a raw WooCommerce slug', async () => {
    const res = await PATCH(req('processing'), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'PREPARING', applied: true, previous_status: 'PENDING' });
  });

  it('understands the wc- prefixed form too', async () => {
    const res = await PATCH(req('wc-cancelled'), { params });
    expect(res.status).toBe(200);
    expect(orderRow?.status).toBe('CANCELLED');
  });

  // The trap this route exists to avoid: the ready stamp updates a
  // courier_orders row that only the move into PREPARING creates, and a no-op
  // UPDATE raises no error. A shop that only ever signals "ready" would have
  // looked fine and dispatched nobody.
  it('walks READY through PREPARING so a courier is actually dispatched', async () => {
    const res = await PATCH(req('READY'), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'READY', passed_through: ['PREPARING'] });
    expect(applied).toEqual([
      { from: 'PENDING', to: 'PREPARING' },
      { from: 'PREPARING', to: 'READY' },
    ]);
  });

  it('does not pass through when the kitchen is already preparing', async () => {
    seed('PREPARING');
    await PATCH(req('READY'), { params });
    expect(applied).toEqual([{ from: 'PREPARING', to: 'READY' }]);
  });

  // A completed delivery is the billable unit in the fleet contract. A shop
  // that marks orders "completed" when payment clears must not be able to
  // invoice a delivery nobody made.
  it('never lets the vendor declare the order delivered', async () => {
    seed('PREPARING');
    for (const s of ['completed', 'DELIVERED', 'IN_DELIVERY', 'out-for-delivery']) {
      const res = await PATCH(req(s), { params });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.applied).toBe(false);
      expect(body.reason).toBe('status_not_settable_by_vendor');
    }
    expect(applied).toEqual([]);
    expect(orderRow?.status).toBe('PREPARING');
  });

  // A retry after a timeout is normal traffic, not an error.
  it('is idempotent on a repeated status', async () => {
    seed('PREPARING');
    const res = await PATCH(req('PREPARING'), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ applied: false, reason: 'already_in_status' });
    expect(applied).toEqual([]);
  });

  it('refuses to move the order backwards', async () => {
    seed('READY');
    const res = await PATCH(req('PREPARING'), { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_transition');
  });

  it('refuses to cancel once a rider is carrying the food', async () => {
    seed('IN_DELIVERY');
    const res = await PATCH(req('cancelled'), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('too_late_to_cancel');
    expect(orderRow?.status).toBe('IN_DELIVERY');
  });

  it('allows a cancel while the food is still in the kitchen', async () => {
    seed('PREPARING');
    const res = await PATCH(req('cancelled'), { params });
    expect(res.status).toBe(200);
    expect(orderRow?.status).toBe('CANCELLED');
  });

  it('refuses to reopen a closed order', async () => {
    seed('CANCELLED');
    const res = await PATCH(req('PREPARING'), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('order_closed');
  });

  // Codex, #1103 P2. POST /orders accepts fulfillment: 'PICKUP', and those
  // orders end at PICKED_UP or NO_SHOW. Neither was in RANK, so both fell to
  // rank 0 and a late retry from the shop could have pushed an order the
  // customer had already collected back into the kitchen queue.
  it('refuses to reopen a finished pickup order', async () => {
    for (const closed of ['PICKED_UP', 'NO_SHOW']) {
      for (const push of ['PREPARING', 'READY', 'cancelled']) {
        seed(closed);
        const res = await PATCH(req(push), { params });
        expect(res.status).toBe(409);
        expect((await res.json()).error).toBe('order_closed');
        expect(orderRow?.status).toBe(closed);
      }
    }
    expect(applied).toEqual([]);
  });

  // Conservative by default: the eleventh status someone adds must not become
  // settable merely because this file has not heard of it yet.
  it('refuses a current status it does not know', async () => {
    seed('SOME_FUTURE_STATUS');
    const res = await PATCH(req('READY'), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('unknown_status');
    expect(applied).toEqual([]);
  });

  it('rejects a status it does not recognise', async () => {
    const res = await PATCH(req('banana'), { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_status');
  });

  it('rejects a malformed body', async () => {
    const bad = new Request(`http://localhost/api/public/v1/orders/${ORDER_ID}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: 'Bearer k' },
      body: 'not json',
    });
    const res = await PATCH(bad, { params });
    expect(res.status).toBe(400);
  });

  it('passes the rate limiter through', async () => {
    checkLimitMock.mockReturnValue({ ok: false, retryAfterSec: 7 });
    const res = await PATCH(req('PREPARING'), { params });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('7');
  });
});
