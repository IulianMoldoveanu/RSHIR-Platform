'use server';

// Server action: persist Netopia configuration into psp_credentials.
//
// Auth: caller must be OWNER on the active tenant. The page guard already
// enforces this; we double-check here because server actions are independent
// callable surfaces.
//
// API key handling: stored in Supabase Vault via the
// public.hir_write_vault_secret SECURITY DEFINER helper (service-role only).
// The psp_credentials row only stores `api_key_vault_name`, the vault
// lookup key. Read path lives in the checkout intent route via
// public.hir_read_vault_secret. Mirrors the SmartBill precedent.

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
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: unknown }>;
  };

  // Per-tenant deterministic vault name. Mirrors SmartBill pattern.
  const vaultName = `psp_netopia_api_key__${tenant.id}`;

  // Build the upsert payload. Only set api_key_vault_name when a new key
  // was provided — empty string means "keep existing", in which case we
  // also do NOT touch the vault entry.
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
    // Write to Vault FIRST so a row never points to a missing secret.
    const { error: vaultErr } = await sb.rpc('hir_write_vault_secret', {
      secret_name: vaultName,
      secret_value: input.apiKey,
      secret_description: `Netopia API key for tenant ${tenant.id}`,
    });
    if (vaultErr) {
      return { ok: false, error: 'vault_write_failed' };
    }
    row.api_key_vault_name = vaultName;
  }

  const { error } = await sb
    .from('psp_credentials')
    .upsert(row, { onConflict: 'tenant_id,provider' });

  if (error) {
    return { ok: false, error: 'persist_failed' };
  }

  return { ok: true };
}
