// Tests for GET /api/public/v1/ping — the authenticated whoami used by
// the WordPress plugin's "Test connection" button. Auth is mocked at the
// boundary; the tenant slug lookup is mocked at the admin client.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TENANT_ID = 'tenant-aaa';

const authMock = vi.fn();
vi.mock('../auth', () => ({
  authenticateBearerKey: (header: string | null) => authMock(header),
}));

const tenantSelectMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(tenantSelectMock()),
        }),
      }),
    }),
  }),
}));

import { GET } from './route';

function makeReq(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/public/v1/ping', {
    method: 'GET',
    headers: { ...headers },
  });
}

describe('GET /api/public/v1/ping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns 401 when the Authorization header is missing/invalid', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('unauthorized');
    // Must not look up a tenant for an unauthenticated request.
    expect(tenantSelectMock).not.toHaveBeenCalled();
  });

  it('returns 200 with the tenant slug for a valid key', async () => {
    authMock.mockResolvedValue({
      tenantId: TENANT_ID,
      keyId: 'apikey-1',
      scopes: ['orders.write'],
    });
    tenantSelectMock.mockReturnValue({
      data: { slug: 'deliveryhouse', name: 'Delivery House' },
      error: null,
    });
    const res = await GET(makeReq({ authorization: 'Bearer hir_x' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      tenant_id: string;
      tenant_slug: string;
      scopes: string[];
    };
    expect(json.ok).toBe(true);
    expect(json.tenant_id).toBe(TENANT_ID);
    expect(json.tenant_slug).toBe('deliveryhouse');
    expect(json.scopes).toEqual(['orders.write']);
  });

  it('still returns 200 with null slug if the tenant row is missing', async () => {
    authMock.mockResolvedValue({
      tenantId: TENANT_ID,
      keyId: 'apikey-1',
      scopes: [],
    });
    tenantSelectMock.mockReturnValue({ data: null, error: null });
    const res = await GET(makeReq({ authorization: 'Bearer hir_x' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; tenant_slug: string | null };
    expect(json.ok).toBe(true);
    expect(json.tenant_slug).toBeNull();
  });
});
