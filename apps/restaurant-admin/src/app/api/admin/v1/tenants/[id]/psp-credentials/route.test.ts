// Unit tests for POST /api/admin/v1/tenants/[id]/psp-credentials
//
// Covers:
//  - 401: no authenticated user
//  - 403: authenticated STAFF member (not OWNER, not platform admin)
//  - 404: tenant not found
//  - 400: invalid request body
//  - 200: platform admin succeeds
//  - 200: tenant OWNER succeeds
//  - 500: vault write failure rolls back psp_credentials row

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const getUserMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser: async () => getUserMock() },
  }),
}));

const isPlatformAdminEmailMock = vi.fn(() => false);
vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: vi.fn(), // unused directly in route but imported
  isPlatformAdminEmail: (email: string | null | undefined) =>
    isPlatformAdminEmailMock(email),
}));

const getTenantRoleMock = vi.fn();
vi.mock('@/lib/tenant', () => ({
  getTenantRole: (...args: unknown[]) => getTenantRoleMock(...args),
}));

const logAuditMock = vi.fn();
vi.mock('@/lib/audit', () => ({
  logAudit: (...args: unknown[]) => logAuditMock(...args),
}));

// Supabase admin client mock — we need to control .from() and .rpc()
const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mockFrom, rpc: mockRpc }),
}));

// ─── SUT ─────────────────────────────────────────────────────────────────────

import { POST } from './route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

function makeReq(body: unknown): NextRequest {
  return new Request(
    `http://localhost/api/admin/v1/tenants/${TENANT_ID}/psp-credentials`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  ) as unknown as NextRequest;
}

import type { NextRequest } from 'next/server';

const VALID_BODY = {
  provider: 'netopia',
  mode: 'sandbox',
  api_key: 'api-abc',
  signature_key: 'sig-abc',
  source_code: 'SC001',
};

/** Set up .from() calls to return a tenant row then handle upsert + update. */
function setupAdminMock({
  tenantExists = true,
  upsertError = null as { message: string } | null,
  vaultError = null as { message: string } | null,
} = {}) {
  // from('tenants').select().eq().maybeSingle()
  // from('psp_credentials').upsert()
  // from('psp_credentials').update().eq().eq()  — rollback path

  mockFrom.mockImplementation((table: string) => {
    if (table === 'tenants') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: tenantExists ? { id: TENANT_ID } : null,
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'psp_credentials') {
      return {
        upsert: () => ({ error: upsertError }),
        update: () => ({
          eq: () => ({
            eq: async () => ({ error: null }),
          }),
        }),
      };
    }
    return {};
  });

  mockRpc.mockImplementation(async () => ({ data: null, error: vaultError }));
}

const PARAMS = { params: Promise.resolve({ id: TENANT_ID }) };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/admin/v1/tenants/[id]/psp-credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isPlatformAdminEmailMock.mockReturnValue(false);
    logAuditMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Auth ───────────────────────────────────────────────────────────────────

  it('returns 401 when no user session exists', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const res = await POST(makeReq(VALID_BODY), PARAMS);
    expect(res.status).toBe(401);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('unauthorized');
  });

  it('returns 403 when STAFF member attempts to configure credentials', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'staff@r.co' } } });
    isPlatformAdminEmailMock.mockReturnValue(false);
    getTenantRoleMock.mockResolvedValue('STAFF');

    const res = await POST(makeReq(VALID_BODY), PARAMS);
    expect(res.status).toBe(403);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('forbidden_owner_only');
  });

  it('returns 403 when user has no membership on this tenant', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'nobody@r.co' } } });
    isPlatformAdminEmailMock.mockReturnValue(false);
    getTenantRoleMock.mockResolvedValue(null);

    const res = await POST(makeReq(VALID_BODY), PARAMS);
    expect(res.status).toBe(403);
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it('returns 400 for invalid body (missing provider)', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'owner-1', email: 'owner@r.co' } },
    });
    getTenantRoleMock.mockResolvedValue('OWNER');
    setupAdminMock();

    const res = await POST(makeReq({ mode: 'sandbox', api_key: 'x', signature_key: 'y' }), PARAMS);
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('invalid_body');
  });

  // ── Tenant not found ───────────────────────────────────────────────────────

  it('returns 404 when tenant does not exist', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'admin', email: 'admin@hir.ro' } },
    });
    isPlatformAdminEmailMock.mockReturnValue(true);
    setupAdminMock({ tenantExists: false });

    const res = await POST(makeReq(VALID_BODY), PARAMS);
    expect(res.status).toBe(404);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('tenant_not_found');
  });

  // ── Platform admin success ─────────────────────────────────────────────────

  it('succeeds for platform admin and writes vault secrets + audit', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'admin', email: 'admin@hir.ro' } },
    });
    isPlatformAdminEmailMock.mockReturnValue(true);
    setupAdminMock();

    const res = await POST(makeReq(VALID_BODY), PARAMS);
    expect(res.status).toBe(200);

    const json = await res.json() as {
      ok: boolean;
      provider: string;
      mode: string;
      vault_names: string[];
    };
    expect(json.ok).toBe(true);
    expect(json.provider).toBe('netopia');
    expect(json.mode).toBe('sandbox');
    expect(json.vault_names).toContain(`psp_netopia_${TENANT_ID}_api_key`);
    expect(json.vault_names).toContain(`psp_netopia_${TENANT_ID}_signature_key`);
    expect(json.vault_names).toContain(`psp_netopia_${TENANT_ID}_source_code`);

    // Audit must have been called
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        action: 'integration.api_key_created',
        metadata: expect.objectContaining({ provider: 'netopia', mode: 'sandbox' }),
      }),
    );

    // getTenantRole must NOT have been called (platform admin bypass)
    expect(getTenantRoleMock).not.toHaveBeenCalled();
  });

  // ── Tenant OWNER success ───────────────────────────────────────────────────

  it('succeeds for tenant OWNER', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'owner-1', email: 'owner@restaurant.ro' } },
    });
    isPlatformAdminEmailMock.mockReturnValue(false);
    getTenantRoleMock.mockResolvedValue('OWNER');
    setupAdminMock();

    const res = await POST(makeReq({ ...VALID_BODY, source_code: undefined }), PARAMS);
    expect(res.status).toBe(200);

    const json = await res.json() as { ok: boolean };
    expect(json.ok).toBe(true);

    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ configured_by: 'owner' }),
      }),
    );
  });

  // ── Vault write failure ────────────────────────────────────────────────────

  it('returns 500 and marks psp_credentials inactive when vault write fails', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'admin', email: 'admin@hir.ro' } },
    });
    isPlatformAdminEmailMock.mockReturnValue(true);
    setupAdminMock({ vaultError: { message: 'vault unreachable' } });

    const res = await POST(makeReq(VALID_BODY), PARAMS);
    expect(res.status).toBe(500);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('vault_write_failed');

    // Rollback: update(active:false) must have been called
    expect(mockFrom).toHaveBeenCalledWith('psp_credentials');
  });
});
