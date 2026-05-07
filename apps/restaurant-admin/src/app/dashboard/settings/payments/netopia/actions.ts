'use server';

// Server action: persist Netopia configuration into psp_credentials.
//
// Auth: caller must be OWNER on the active tenant. The page guard already
// enforces this; we double-check here because server actions are independent
// callable surfaces.
//
// API key handling: stored in api_key_encrypted column. V1 stores plaintext
// in a column named *_encrypted as a placeholder — a follow-up PR wires
// pgsodium / Vault encryption once Iulian decides which approach to use
// (matches the SmartBill API token pattern, which uses Supabase Vault).
// TODO(V2): swap to vault.create_secret + vault.decrypted_secrets read.

import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';

type SaveInput = {
  tenantId: string;
  mode: 'MARKETPLACE' | 'STANDARD';
  signature: string;
  subMerchantId: string | null;
  apiKey: string | null;
  live: boolean;
  active: boolean;
};

type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveNetopiaConfig(input: SaveInput): Promise<SaveResult> {
  const { user, tenant } = await getActiveTenant();
  if (tenant.id !== input.tenantId) {
    return { ok: false, error: 'tenant_mismatch' };
  }
  const role = await getTenantRole(user.id, tenant.id);
  if (role !== 'OWNER') {
    return { ok: false, error: 'forbidden' };
  }

  if (!input.signature) {
    return { ok: false, error: 'signature_required' };
  }
  if (input.mode === 'MARKETPLACE' && !input.subMerchantId) {
    return { ok: false, error: 'sub_merchant_id_required' };
  }

  const admin = createAdminClient();

  // Cast through unknown — psp_credentials not yet in generated types.
  const sb = admin as unknown as {
    from: (t: string) => {
      upsert: (
        row: Record<string, unknown>,
        opts: { onConflict: string },
      ) => Promise<{ error: unknown }>;
    };
  };

  // Build the upsert payload. Only include api_key_encrypted when a new
  // key was provided — empty string means "keep existing".
  const row: Record<string, unknown> = {
    tenant_id: tenant.id,
    provider: 'netopia',
    mode: input.mode,
    signature: input.signature,
    sub_merchant_id: input.subMerchantId,
    live: input.live,
    active: input.active,
    updated_at: new Date().toISOString(),
  };
  if (input.apiKey) {
    row.api_key_encrypted = input.apiKey;
  }

  const { error } = await sb
    .from('psp_credentials')
    .upsert(row, { onConflict: 'tenant_id,provider' });

  if (error) {
    return { ok: false, error: 'persist_failed' };
  }

  return { ok: true };
}
