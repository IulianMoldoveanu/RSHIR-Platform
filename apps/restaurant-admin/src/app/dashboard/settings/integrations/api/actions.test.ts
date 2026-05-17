import { describe, expect, it, vi, beforeEach } from 'vitest';
import { randomBytes, createHash } from 'crypto';

// Unit test: the sandbox key generator produces a 43-char base64url string.
// This mirrors the exact logic in createSandboxKey and is extracted here so
// we can test it without mocking the full server-action dependency tree.
function generateSandboxKey(): string {
  return `hir_${randomBytes(32).toString('base64url')}`;
}

describe('generateSandboxKey', () => {
  it('produces a string starting with "hir_"', () => {
    const key = generateSandboxKey();
    expect(key.startsWith('hir_')).toBe(true);
  });

  it('produces a 47-char string (hir_ + 43 base64url chars for 32 bytes)', () => {
    // randomBytes(32) → 32 bytes → base64url → 43 chars (ceil(32*4/3), no padding)
    const key = generateSandboxKey();
    expect(key).toHaveLength(47);
  });

  it('key suffix is base64url (no +, /, or = padding)', () => {
    for (let i = 0; i < 20; i++) {
      const key = generateSandboxKey();
      const suffix = key.slice(4); // strip "hir_"
      expect(suffix).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('sha256 hash of key is 64-char lowercase hex', () => {
    const key = generateSandboxKey();
    const hash = createHash('sha256').update(key).digest('hex');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('key_prefix is first 8 characters', () => {
    const key = generateSandboxKey();
    const prefix = key.slice(0, 8);
    expect(prefix).toBe('hir_' + key.slice(4, 8));
    expect(prefix).toHaveLength(8);
  });

  it('each call produces a unique key', () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateSandboxKey()));
    expect(keys.size).toBe(50);
  });
});

// Server action guard path tests — mock the full dependency tree.
const supabaseUser = vi.hoisted(() => vi.fn());
const tenantMock = vi.hoisted(() => vi.fn());
const tenantRoleMock = vi.hoisted(() => vi.fn());
const auditMock = vi.hoisted(() => vi.fn());
const adminBuilder = vi.hoisted(() => ({ factory: vi.fn() }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser: supabaseUser } }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => adminBuilder.factory(),
}));
vi.mock('@/lib/tenant', () => ({
  getActiveTenant: () =>
    Promise.resolve({ user: { id: 'uid-1' }, tenant: tenantMock() }),
  getTenantRole: () => Promise.resolve(tenantRoleMock()),
}));
vi.mock('@/lib/audit', () => ({ logAudit: auditMock }));

const TENANT_ID = '00000000-0000-0000-0000-aaaaaaaaaaaa';

function makeInsertMock(opts: { error?: { message: string } | null } = {}) {
  const single = vi.fn(() =>
    Promise.resolve({ data: { id: 'key-uuid-1' }, error: opts.error ?? null }),
  );
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  return { from, _single: single };
}

function makeUpdateMock(opts: { error?: { message: string } | null } = {}) {
  const secondEq = vi.fn(() => Promise.resolve({ error: opts.error ?? null }));
  const firstEq = vi.fn(() => ({ eq: secondEq }));
  const update = vi.fn(() => ({ eq: firstEq }));
  const from = vi.fn(() => ({ update }));
  return { from };
}

function setupHappy(role = 'OWNER') {
  tenantMock.mockReturnValue({ id: TENANT_ID });
  tenantRoleMock.mockReturnValue(role);
  auditMock.mockResolvedValue(undefined);
}

describe('createSandboxKey (server action guards)', () => {
  beforeEach(() => {
    tenantMock.mockReset();
    tenantRoleMock.mockReset();
    auditMock.mockReset();
    adminBuilder.factory.mockReset();
  });

  it('returns error for missing tenant id', async () => {
    const { createSandboxKey } = await import('./actions');
    const r = await createSandboxKey('');
    expect(r).toMatchObject({ ok: false, error: 'missing_tenant_id' });
  });

  it('returns error on tenant mismatch', async () => {
    setupHappy();
    const { createSandboxKey } = await import('./actions');
    const r = await createSandboxKey('different-tenant-id');
    expect(r).toMatchObject({ ok: false, error: 'tenant_mismatch' });
  });

  it('returns forbidden when not OWNER', async () => {
    setupHappy('STAFF');
    adminBuilder.factory.mockReturnValue(makeInsertMock().from);
    const { createSandboxKey } = await import('./actions');
    const r = await createSandboxKey(TENANT_ID);
    expect(r).toMatchObject({ ok: false, error: 'forbidden' });
  });

  it('returns rawKey and keyPrefix on success', async () => {
    setupHappy();
    const mock = makeInsertMock();
    adminBuilder.factory.mockReturnValue({ from: mock.from });
    const { createSandboxKey } = await import('./actions');
    const r = await createSandboxKey(TENANT_ID);
    expect(r).toMatchObject({ ok: true });
    if (r.ok) {
      expect(r.rawKey).toMatch(/^hir_[A-Za-z0-9_-]+$/);
      expect(r.keyPrefix).toHaveLength(8);
      expect(auditMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'integration.api_key_created' }),
      );
    }
  });
});

describe('revokeKey (server action guards)', () => {
  beforeEach(() => {
    tenantMock.mockReset();
    tenantRoleMock.mockReset();
    auditMock.mockReset();
    adminBuilder.factory.mockReset();
  });

  it('returns forbidden when not OWNER', async () => {
    setupHappy('STAFF');
    const { revokeKey } = await import('./actions');
    const r = await revokeKey('key-id', TENANT_ID);
    expect(r).toMatchObject({ ok: false, error: 'forbidden' });
  });

  it('returns ok on successful revoke', async () => {
    setupHappy();
    const mock = makeUpdateMock();
    adminBuilder.factory.mockReturnValue({ from: mock.from });
    const { revokeKey } = await import('./actions');
    const r = await revokeKey('key-id', TENANT_ID);
    expect(r).toMatchObject({ ok: true });
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'integration.api_key_revoked' }),
    );
  });
});
