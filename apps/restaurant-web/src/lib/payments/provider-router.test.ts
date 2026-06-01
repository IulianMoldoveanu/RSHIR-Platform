// Unit tests for loadProviderCredentials — covers:
//   1. DB-backed lookup: happy path (STANDARD + MARKETPLACE)
//   2. DB-backed lookup: vault secret missing → falls back to env
//   3. DB row missing → falls back to env (happy path)
//   4. DB row missing + env missing → null
//   5. DB lookup error → falls back to env

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('server-only', () => ({}));

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('../supabase-admin', () => ({
  getSupabaseAdmin: () => ({ from: mockFrom, rpc: mockRpc }),
}));

// ─── Subject ─────────────────────────────────────────────────────────────────

// Import after mocks are registered.
import { loadProviderCredentials, pspVaultName } from './provider-router';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TENANT = 'tenant-uuid-1234';

function makeDbRow(overrides: Partial<{
  mode: string;
  signature: string | null;
  sub_merchant_id: string | null;
  api_key_vault_name: string | null;
  live: boolean;
}> = {}) {
  return {
    mode: 'STANDARD',
    signature: 'row-sig',
    sub_merchant_id: null,
    api_key_vault_name: null,
    live: false,
    ...overrides,
  };
}

function setupDbRow(row: ReturnType<typeof makeDbRow> | null, dbError: { message: string } | null = null) {
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error: dbError }),
          }),
        }),
      }),
    }),
  });
}

function setupVaultReads(values: Record<string, string | null>) {
  mockRpc.mockImplementation(async (_fn: string, { secret_name }: { secret_name: string }) => {
    const val = Object.prototype.hasOwnProperty.call(values, secret_name)
      ? values[secret_name]
      : null;
    return { data: val, error: null };
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('loadProviderCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Wipe env vars before each test.
    delete process.env.NETOPIA_SANDBOX_SIGNATURE;
    delete process.env.NETOPIA_SANDBOX_API_KEY;
    delete process.env.NETOPIA_LIVE_SIGNATURE;
    delete process.env.NETOPIA_LIVE_API_KEY;
    delete process.env.NETOPIA_MARKETPLACE_ENABLED;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── DB-backed: STANDARD happy path ─────────────────────────────────────────

  it('returns STANDARD credentials from DB + vault', async () => {
    setupDbRow(makeDbRow());
    setupVaultReads({
      [pspVaultName('netopia', TENANT, 'api_key')]: 'vault-api-key',
      [pspVaultName('netopia', TENANT, 'signature_key')]: 'vault-sig-key',
      [pspVaultName('netopia', TENANT, 'source_code')]: null,
    });

    const creds = await loadProviderCredentials(TENANT, 'netopia', 'card_sandbox');

    expect(creds).not.toBeNull();
    expect(creds?.mode).toBe('STANDARD');
    expect(creds?.apiKey).toBe('vault-api-key');
    expect(creds?.signature).toBe('vault-sig-key');
    expect(creds?.live).toBe(false);
    // Env vars must not have been consulted.
    expect(mockFrom).toHaveBeenCalledOnce();
  });

  // ── DB-backed: MARKETPLACE happy path ──────────────────────────────────────

  it('returns MARKETPLACE credentials with sub_merchant_id from DB + vault', async () => {
    setupDbRow(makeDbRow({ mode: 'MARKETPLACE', sub_merchant_id: 'sub-123' }));
    setupVaultReads({
      [pspVaultName('netopia', TENANT, 'api_key')]: 'vault-api-key',
      [pspVaultName('netopia', TENANT, 'signature_key')]: 'vault-sig-key',
      [pspVaultName('netopia', TENANT, 'source_code')]: 'sc-99',
    });

    const creds = await loadProviderCredentials(TENANT, 'netopia', 'card_live');

    expect(creds?.mode).toBe('MARKETPLACE');
    expect((creds as { subMerchantId?: string }).subMerchantId).toBe('sub-123');
    expect(creds?.sourceCode).toBe('sc-99');
    expect(creds?.live).toBe(true);
  });

  // ── DB-backed: vault secrets incomplete → fallback ──────────────────────────

  it('falls back to env when vault secrets are missing', async () => {
    setupDbRow(makeDbRow({ signature: null })); // no inline sig either
    setupVaultReads({
      // api_key present but signature_key absent
      [pspVaultName('netopia', TENANT, 'api_key')]: 'vault-api-key',
      [pspVaultName('netopia', TENANT, 'signature_key')]: null,
      [pspVaultName('netopia', TENANT, 'source_code')]: null,
    });
    // Provide env fallback
    process.env.NETOPIA_SANDBOX_SIGNATURE = 'env-sig';
    process.env.NETOPIA_SANDBOX_API_KEY = 'env-api';

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const creds = await loadProviderCredentials(TENANT, 'netopia', 'card_sandbox');

    expect(creds?.mode).toBe('STANDARD');
    expect(creds?.apiKey).toBe('env-api');
    expect(creds?.signature).toBe('env-sig');
    // Must have warned about incomplete vault + shared-credentials.
    expect(warnSpy).toHaveBeenCalled();
  });

  // ── No DB row → env fallback (happy path) ──────────────────────────────────

  it('uses env vars when psp_credentials row is absent', async () => {
    setupDbRow(null);
    process.env.NETOPIA_LIVE_SIGNATURE = 'env-sig-live';
    process.env.NETOPIA_LIVE_API_KEY = 'env-api-live';

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const creds = await loadProviderCredentials(TENANT, 'netopia', 'card_live');

    expect(creds?.mode).toBe('STANDARD');
    expect(creds?.signature).toBe('env-sig-live');
    expect(creds?.live).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('using shared credentials'),
    );
    // Vault RPCs must not have been called.
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // ── No DB row + env missing → null ─────────────────────────────────────────

  it('returns null when neither DB row nor env vars are configured', async () => {
    setupDbRow(null);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const creds = await loadProviderCredentials(TENANT, 'netopia', 'card_live');

    expect(creds).toBeNull();
  });

  // ── DB error → env fallback ─────────────────────────────────────────────────

  it('falls back to env when psp_credentials DB query errors', async () => {
    setupDbRow(null, { message: 'connection refused' });
    process.env.NETOPIA_SANDBOX_SIGNATURE = 'env-sig';
    process.env.NETOPIA_SANDBOX_API_KEY = 'env-api';

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const creds = await loadProviderCredentials(TENANT, 'netopia', 'card_sandbox');

    expect(creds?.mode).toBe('STANDARD');
    expect(creds?.apiKey).toBe('env-api');
  });

  // ── No tenantId → skips DB, goes straight to env ───────────────────────────

  it('skips DB lookup when tenantId is undefined and reads env', async () => {
    process.env.NETOPIA_SANDBOX_SIGNATURE = 'env-sig';
    process.env.NETOPIA_SANDBOX_API_KEY = 'env-api';

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const creds = await loadProviderCredentials(undefined, 'netopia', 'card_sandbox');

    expect(creds?.mode).toBe('STANDARD');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ─── pspVaultName ────────────────────────────────────────────────────────────

describe('pspVaultName', () => {
  it('produces stable names for netopia', () => {
    expect(pspVaultName('netopia', 'abc', 'api_key')).toBe('psp_netopia_abc_api_key');
    expect(pspVaultName('netopia', 'abc', 'signature_key')).toBe('psp_netopia_abc_signature_key');
    expect(pspVaultName('netopia', 'abc', 'source_code')).toBe('psp_netopia_abc_source_code');
  });

  it('produces stable names for viva', () => {
    expect(pspVaultName('viva', 'xyz', 'api_key')).toBe('psp_viva_xyz_api_key');
  });
});
