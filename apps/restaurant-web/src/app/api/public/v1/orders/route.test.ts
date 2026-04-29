// Regression tests for POST /api/public/v1/orders (RSHIR-52).
// Bearer-key gated — used by external POS systems to push orders into
// HIR. Most attack surface lives in the auth boundary + the zod body
// schema, both fully exercised here. The DB write path is mocked at the
// admin client boundary so we can verify the row shape without a live
// Supabase.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TENANT_ID = 'tenant-aaa';
const API_KEY_ID = 'apikey-1';

const authMock = vi.fn();
vi.mock('../auth', () => ({
  authenticateBearerKey: (header: string | null) => authMock(header),
}));

const customerInsertMock = vi.fn();
const orderInsertMock = vi.fn();

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      insert: (row: unknown) => ({
        select: () => ({
          single: () => {
            if (table === 'customers') return Promise.resolve(customerInsertMock(row));
            if (table === 'restaurant_orders') return Promise.resolve(orderInsertMock(row));
            return Promise.resolve({ data: null, error: { message: 'unexpected_table' } });
          },
        }),
      }),
    }),
  }),
}));

const dispatchMock = vi.fn(async () => undefined);
vi.mock('@/lib/integration-bus', () => ({
  dispatchOrderEvent: (...args: unknown[]) => dispatchMock(...args),
}));

import { POST } from './route';

const VALID_BODY = {
  customer: { firstName: 'Ana', phone: '0700000000', email: 'ana@example.com' },
  items: [{ name: 'Pizza', qty: 1, priceRon: 30 }],
  totals: { subtotalRon: 30, deliveryFeeRon: 5, totalRon: 35 },
  fulfillment: 'DELIVERY',
  dropoff: { line1: 'Strada Mare 10', city: 'București' },
  notes: '',
} as const;

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/public/v1/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/public/v1/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns 401 when Authorization header is missing', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('unauthorized');
    // Body must not be parsed if auth fails — saves work and avoids
    // accidentally caching the parsed body in any debug log.
    expect(customerInsertMock).not.toHaveBeenCalled();
  });

  it('returns 401 when key is valid but lacks orders.write scope', async () => {
    authMock.mockResolvedValue({
      tenantId: TENANT_ID,
      keyId: API_KEY_ID,
      scopes: ['orders.read'], // missing orders.write
    });
    const res = await POST(makeReq(VALID_BODY, { authorization: 'Bearer hir_x' }));
    expect(res.status).toBe(401);
    expect(customerInsertMock).not.toHaveBeenCalled();
  });

  it('returns 400 invalid_request when body fails zod (missing items)', async () => {
    authMock.mockResolvedValue({
      tenantId: TENANT_ID,
      keyId: API_KEY_ID,
      scopes: ['orders.write'],
    });
    const res = await POST(makeReq({ ...VALID_BODY, items: [] }, { authorization: 'Bearer hir_x' }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_request');
    expect(customerInsertMock).not.toHaveBeenCalled();
  });

  it('returns 400 when DELIVERY is requested without a dropoff', async () => {
    authMock.mockResolvedValue({
      tenantId: TENANT_ID,
      keyId: API_KEY_ID,
      scopes: ['orders.write'],
    });
    const { dropoff: _drop, ...withoutDropoff } = VALID_BODY;
    const res = await POST(
      makeReq({ ...withoutDropoff, fulfillment: 'DELIVERY' }, { authorization: 'Bearer hir_x' }),
    );
    expect(res.status).toBe(400);
    expect(customerInsertMock).not.toHaveBeenCalled();
  });

  it('returns 400 invalid_request when body is not JSON', async () => {
    authMock.mockResolvedValue({
      tenantId: TENANT_ID,
      keyId: API_KEY_ID,
      scopes: ['orders.write'],
    });
    const res = await POST(makeReq('this is not json', { authorization: 'Bearer hir_x' }));
    expect(res.status).toBe(400);
  });

  it('returns 500 order_insert_failed if the customers insert errors', async () => {
    authMock.mockResolvedValue({
      tenantId: TENANT_ID,
      keyId: API_KEY_ID,
      scopes: ['orders.write'],
    });
    customerInsertMock.mockReturnValue({
      data: null,
      error: { message: 'sensitive infra detail' },
    });
    const res = await POST(makeReq(VALID_BODY, { authorization: 'Bearer hir_x' }));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('order_insert_failed');
    // SECURITY: external POS callers must not see DB internals.
    expect(JSON.stringify(json)).not.toContain('sensitive infra detail');
    // Order insert must not run if customer insert failed.
    expect(orderInsertMock).not.toHaveBeenCalled();
    // Integration dispatcher must not be called on a failed insert.
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('returns 500 order_insert_failed if the orders insert errors', async () => {
    authMock.mockResolvedValue({
      tenantId: TENANT_ID,
      keyId: API_KEY_ID,
      scopes: ['orders.write'],
    });
    customerInsertMock.mockReturnValue({ data: { id: 'cust-1' }, error: null });
    orderInsertMock.mockReturnValue({ data: null, error: { message: 'fk violation' } });
    const res = await POST(makeReq(VALID_BODY, { authorization: 'Bearer hir_x' }));
    expect(res.status).toBe(500);
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('happy path: returns 201 with order_id + track token, writes correct row, dispatches event', async () => {
    authMock.mockResolvedValue({
      tenantId: TENANT_ID,
      keyId: API_KEY_ID,
      scopes: ['orders.write'],
    });
    customerInsertMock.mockReturnValue({ data: { id: 'cust-1' }, error: null });
    orderInsertMock.mockReturnValue({
      data: { id: 'order-1', public_track_token: 'tok-1' },
      error: null,
    });

    const res = await POST(makeReq(VALID_BODY, { authorization: 'Bearer hir_x' }));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { order_id: string; public_track_token: string };
    expect(json).toEqual({ order_id: 'order-1', public_track_token: 'tok-1' });

    // Customer row: tenant_id from the AUTH context, never from the body.
    expect(customerInsertMock).toHaveBeenCalledTimes(1);
    const [custRow] = customerInsertMock.mock.calls[0];
    expect(custRow).toMatchObject({
      tenant_id: TENANT_ID,
      first_name: 'Ana',
      phone: '0700000000',
      email: 'ana@example.com',
    });

    // Order row: source EXTERNAL_API, tenant from auth, status PENDING,
    // payment UNPAID (external POS owns payment).
    expect(orderInsertMock).toHaveBeenCalledTimes(1);
    const [orderRow] = orderInsertMock.mock.calls[0];
    expect(orderRow).toMatchObject({
      tenant_id: TENANT_ID,
      customer_id: 'cust-1',
      status: 'PENDING',
      payment_status: 'UNPAID',
      source: 'EXTERNAL_API',
      total_ron: 35,
    });

    // Integration event fired with EXTERNAL_API source.
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    const [tenantArg, eventArg, payloadArg] = dispatchMock.mock.calls[0];
    expect(tenantArg).toBe(TENANT_ID);
    expect(eventArg).toBe('created');
    expect(payloadArg).toMatchObject({
      orderId: 'order-1',
      source: 'EXTERNAL_API',
      status: 'PENDING',
    });
  });

  it('uses tenant_id from the auth context, ignoring any tenant_id smuggled into the body', async () => {
    authMock.mockResolvedValue({
      tenantId: TENANT_ID,
      keyId: API_KEY_ID,
      scopes: ['orders.write'],
    });
    customerInsertMock.mockReturnValue({ data: { id: 'cust-1' }, error: null });
    orderInsertMock.mockReturnValue({
      data: { id: 'order-1', public_track_token: 'tok-1' },
      error: null,
    });
    // Even if a malicious caller passes tenant_id in the body, we must
    // ignore it and use the auth context's tenantId.
    const res = await POST(
      makeReq(
        { ...VALID_BODY, tenant_id: 'attacker-tenant' },
        { authorization: 'Bearer hir_x' },
      ),
    );
    expect(res.status).toBe(201);
    const [custRow] = customerInsertMock.mock.calls[0];
    expect((custRow as { tenant_id: string }).tenant_id).toBe(TENANT_ID);
    const [orderRow] = orderInsertMock.mock.calls[0];
    expect((orderRow as { tenant_id: string }).tenant_id).toBe(TENANT_ID);
  });
});
