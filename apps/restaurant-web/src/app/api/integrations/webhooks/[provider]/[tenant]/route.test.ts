// Regression tests for the inbound integration webhook router (RSHIR-53).
// This is a public, HMAC-gated surface — wrong handling here means a POS
// vendor could either (a) flip order state on the wrong tenant, or
// (b) leak provider config to unauthenticated callers. Both are caught
// below: tenant-scoped UPDATE WHERE clause, terse 401 on bad signature.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ORDER_ID = '22222222-2222-2222-2222-222222222222';

// --- mocks ---

const providerSelectMock = vi.fn();
const orderUpdateMock = vi.fn();
const auditInsertMock = vi.fn();

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve(providerSelectMock(table)),
          }),
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

const verifyWebhookMock = vi.fn();
vi.mock('@hir/integration-core', () => ({
  getAdapter: () => ({
    providerKey: 'mock',
    verifyWebhook: (...args: unknown[]) => verifyWebhookMock(...args),
  }),
}));

import { POST } from './route';

function makeReq(body = '{}', headers: Record<string, string> = {}) {
  return new Request(
    `http://localhost/api/integrations/webhooks/mock/${TENANT_ID}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    },
  );
}

describe('POST /api/integrations/webhooks/[provider]/[tenant]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerSelectMock.mockReturnValue({
      data: {
        provider_key: 'mock',
        config: {},
        webhook_secret: 'secret',
        is_active: true,
      },
      error: null,
    });
    orderUpdateMock.mockReturnValue({ error: null });
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns 404 for an unknown provider', async () => {
    const res = await POST(makeReq(), {
      params: Promise.resolve({ provider: 'totally-fake', tenant: TENANT_ID }),
    });
    expect(res.status).toBe(404);
    expect(providerSelectMock).not.toHaveBeenCalled();
  });

  it('returns 404 when tenant param is not a UUID', async () => {
    const res = await POST(makeReq(), {
      params: Promise.resolve({ provider: 'mock', tenant: 'not-a-uuid' }),
    });
    expect(res.status).toBe(404);
    expect(providerSelectMock).not.toHaveBeenCalled();
  });

  it('returns 404 when (tenant, provider) row is missing', async () => {
    providerSelectMock.mockReturnValue({ data: null, error: null });
    const res = await POST(makeReq(), {
      params: Promise.resolve({ provider: 'mock', tenant: TENANT_ID }),
    });
    expect(res.status).toBe(404);
    expect(verifyWebhookMock).not.toHaveBeenCalled();
  });

  it('returns 404 when provider row exists but is_active=false', async () => {
    providerSelectMock.mockReturnValue({
      data: { provider_key: 'mock', config: {}, webhook_secret: 'secret', is_active: false },
      error: null,
    });
    const res = await POST(makeReq(), {
      params: Promise.resolve({ provider: 'mock', tenant: TENANT_ID }),
    });
    expect(res.status).toBe(404);
    expect(verifyWebhookMock).not.toHaveBeenCalled();
  });

  it('returns 500 lookup_failed if the provider lookup errors', async () => {
    providerSelectMock.mockReturnValue({
      data: null,
      error: { message: 'sensitive postgres detail' },
    });
    const res = await POST(makeReq(), {
      params: Promise.resolve({ provider: 'mock', tenant: TENANT_ID }),
    });
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('lookup_failed');
    // SECURITY: don't echo the DB error to anonymous callers.
    expect(JSON.stringify(json)).not.toContain('sensitive postgres detail');
    expect(verifyWebhookMock).not.toHaveBeenCalled();
  });

  it('returns 401 when adapter.verifyWebhook returns null (bad signature)', async () => {
    verifyWebhookMock.mockResolvedValue(null);
    const res = await POST(makeReq('{"foo":"bar"}'), {
      params: Promise.resolve({ provider: 'mock', tenant: TENANT_ID }),
    });
    expect(res.status).toBe(401);
    expect(orderUpdateMock).not.toHaveBeenCalled();
    expect(auditInsertMock).not.toHaveBeenCalled();
  });

  it('order.status_changed: writes scoped update + audit, returns 200', async () => {
    verifyWebhookMock.mockResolvedValue({
      kind: 'order.status_changed',
      orderId: ORDER_ID,
      status: 'CONFIRMED',
    });
    const res = await POST(makeReq(), {
      params: Promise.resolve({ provider: 'mock', tenant: TENANT_ID }),
    });
    expect(res.status).toBe(200);

    // Update payload: status flipped, scoped by BOTH order id AND tenant_id.
    // The tenant_id WHERE is the security guard — without it, a malicious
    // POS could flip another tenant's order by guessing its UUID.
    expect(orderUpdateMock).toHaveBeenCalledTimes(1);
    const [table, patch, scope] = orderUpdateMock.mock.calls[0];
    expect(table).toBe('restaurant_orders');
    expect(patch).toEqual({ status: 'CONFIRMED' });
    expect(scope).toEqual({
      col1: 'id',
      val1: ORDER_ID,
      col2: 'tenant_id',
      val2: TENANT_ID,
    });

    expect(auditInsertMock).toHaveBeenCalledTimes(1);
    const [auditTable, auditRow] = auditInsertMock.mock.calls[0];
    expect(auditTable).toBe('audit_log');
    expect(auditRow).toMatchObject({
      tenant_id: TENANT_ID,
      actor_user_id: null,
      action: 'integration.webhook_received',
      entity_type: 'integration_webhook',
      metadata: { kind: 'order.status_changed', provider_key: 'mock' },
    });
  });

  it('order.created: returns 202 (acknowledge only) and audits', async () => {
    verifyWebhookMock.mockResolvedValue({
      kind: 'order.created',
      payload: { orderId: ORDER_ID, source: 'EXTERNAL_API' },
    });
    const res = await POST(makeReq(), {
      params: Promise.resolve({ provider: 'mock', tenant: TENANT_ID }),
    });
    expect(res.status).toBe(202);
    const json = (await res.json()) as { ok: boolean; accepted: boolean };
    expect(json).toEqual({ ok: true, accepted: false });

    // No order mutation — created flow is the public/v1/orders path.
    expect(orderUpdateMock).not.toHaveBeenCalled();
    expect(auditInsertMock).toHaveBeenCalledTimes(1);
    const [, auditRow] = auditInsertMock.mock.calls[0];
    expect((auditRow as { metadata: { kind: string } }).metadata.kind).toBe('order.created');
  });

  it('still returns 200 even when the order update DB call errors (best-effort)', async () => {
    verifyWebhookMock.mockResolvedValue({
      kind: 'order.status_changed',
      orderId: ORDER_ID,
      status: 'CONFIRMED',
    });
    orderUpdateMock.mockReturnValue({ error: { message: 'fk violation' } });
    const res = await POST(makeReq(), {
      params: Promise.resolve({ provider: 'mock', tenant: TENANT_ID }),
    });
    // The router logs and continues — POS retries are not a 500 problem
    // for HIR. But the audit row still fires so the operator can see it.
    expect(res.status).toBe(200);
    expect(auditInsertMock).toHaveBeenCalledTimes(1);
  });

  it('passes the tenant id from the URL into the adapter context (not from the body)', async () => {
    verifyWebhookMock.mockResolvedValue({
      kind: 'order.status_changed',
      orderId: ORDER_ID,
      status: 'CONFIRMED',
    });
    // Even if the request body claims a different tenant_id, the adapter
    // is invoked with the URL-derived tenant.
    await POST(
      makeReq(JSON.stringify({ tenant_id: 'attacker-tenant', orderId: ORDER_ID })),
      { params: Promise.resolve({ provider: 'mock', tenant: TENANT_ID }) },
    );
    const [ctx] = verifyWebhookMock.mock.calls[0];
    expect((ctx as { tenantId: string }).tenantId).toBe(TENANT_ID);
  });

  it('returns 200 ok for unknown event kinds (forward-compatible default)', async () => {
    verifyWebhookMock.mockResolvedValue({
      kind: 'something.new',
    });
    const res = await POST(makeReq(), {
      params: Promise.resolve({ provider: 'mock', tenant: TENANT_ID }),
    });
    expect(res.status).toBe(200);
  });
});
