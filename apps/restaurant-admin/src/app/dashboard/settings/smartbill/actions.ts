'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';
import {
  isValidSeries,
  isValidToken,
  isValidUsername,
  normalizeCif,
  readSmartbillSettings,
} from '@/lib/smartbill';

export type SmartbillResult =
  | { ok: true }
  | { ok: false; error: string; detail?: string };

type AdminLike = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const SMARTBILL_PUSH_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/smartbill-push`
    : null;

function vaultSecretName(tenantId: string): string {
  return `smartbill_api_token_${tenantId}`;
}

/**
 * Save the non-sensitive SmartBill settings + (optionally) rotate the API
 * token in the Vault. Token field is write-only — empty value means "leave
 * existing alone". Submit a literal "__CLEAR__" sentinel to remove it.
 */
export async function saveSmartbillSettings(formData: FormData): Promise<SmartbillResult> {
  const username = String(formData.get('username') ?? '').trim();
  const cifInput = String(formData.get('cif') ?? '').trim();
  const series = String(formData.get('series_invoice') ?? '').trim();
  const enabled = formData.get('enabled') === 'on';
  const autoPush = formData.get('auto_push_enabled') === 'on';
  const tokenInput = String(formData.get('api_token') ?? '');
  const expectedTenantId = String(formData.get('tenantId') ?? '');

  if (!expectedTenantId) {
    return { ok: false, error: 'invalid_input', detail: 'tenantId' };
  }
  if (!isValidUsername(username)) {
    return { ok: false, error: 'invalid_input', detail: 'username' };
  }
  const cif = normalizeCif(cifInput);
  if (!cif) {
    return { ok: false, error: 'invalid_input', detail: 'cif' };
  }
  if (!isValidSeries(series)) {
    return { ok: false, error: 'invalid_input', detail: 'series_invoice' };
  }

  const { user, tenant } = await getActiveTenant().catch(() => ({
    user: null,
    tenant: null,
  }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (tenant.id !== expectedTenantId) return { ok: false, error: 'tenant_mismatch' };

  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  const admin = createAdminClient();

  // Token rotation. Empty = leave alone; '__CLEAR__' sentinel = delete.
  let tokenAction: 'kept' | 'set' | 'cleared' = 'kept';
  if (tokenInput === '__CLEAR__') {
    const { error } = await (admin as unknown as AdminLike).rpc(
      'hir_delete_vault_secret',
      { secret_name: vaultSecretName(expectedTenantId) },
    );
    if (error) {
      return { ok: false, error: 'db_error', detail: `vault_delete: ${error.message}` };
    }
    tokenAction = 'cleared';
  } else if (tokenInput.length > 0) {
    if (!isValidToken(tokenInput)) {
      return { ok: false, error: 'invalid_input', detail: 'api_token' };
    }
    const { error } = await (admin as unknown as AdminLike).rpc(
      'hir_write_vault_secret',
      {
        secret_name: vaultSecretName(expectedTenantId),
        secret_value: tokenInput.trim(),
        secret_description: `SmartBill API token for tenant ${expectedTenantId}`,
      },
    );
    if (error) {
      return { ok: false, error: 'db_error', detail: `vault_write: ${error.message}` };
    }
    tokenAction = 'set';
  }

  // Read-merge-write the jsonb settings. Avoid clobbering unrelated keys.
  const { data: tenantRow, error: readErr } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', expectedTenantId)
    .single();
  if (readErr || !tenantRow) {
    return { ok: false, error: 'db_error', detail: readErr?.message ?? 'tenant_not_found' };
  }
  const currentSettings =
    tenantRow.settings && typeof tenantRow.settings === 'object'
      ? (tenantRow.settings as Record<string, unknown>)
      : {};
  const currentSb = readSmartbillSettings(currentSettings);

  const nextSb = {
    ...currentSb,
    enabled,
    username,
    cif,
    series_invoice: series,
    auto_push_enabled: autoPush,
  };

  const { error: writeErr } = await admin
    .from('tenants')
    .update({ settings: { ...currentSettings, smartbill: nextSb } })
    .eq('id', expectedTenantId);
  if (writeErr) {
    return { ok: false, error: 'db_error', detail: writeErr.message };
  }

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: user.id,
    action: 'smartbill.settings_updated',
    entityType: 'tenant',
    entityId: expectedTenantId,
    metadata: {
      enabled,
      auto_push_enabled: autoPush,
      token_action: tokenAction,
    },
  });
  if (tokenAction === 'set') {
    await logAudit({
      tenantId: expectedTenantId,
      actorUserId: user.id,
      action: 'smartbill.token_set',
      entityType: 'tenant',
      entityId: expectedTenantId,
    });
  } else if (tokenAction === 'cleared') {
    await logAudit({
      tenantId: expectedTenantId,
      actorUserId: user.id,
      action: 'smartbill.token_cleared',
      entityType: 'tenant',
      entityId: expectedTenantId,
    });
  }

  revalidatePath('/dashboard/settings/smartbill');
  return { ok: true };
}

/**
 * Hit the Edge Function in `test` mode for the active tenant. Returns the
 * SmartBill response so the UI can show "OK" or the actual error text.
 */
export async function testSmartbillConnection(
  tenantId: string,
): Promise<SmartbillResult> {
  if (!tenantId) return { ok: false, error: 'invalid_input' };
  const { user, tenant } = await getActiveTenant().catch(() => ({
    user: null,
    tenant: null,
  }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (tenant.id !== tenantId) return { ok: false, error: 'tenant_mismatch' };
  const role = await getTenantRole(user.id, tenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  if (!SMARTBILL_PUSH_URL) {
    return { ok: false, error: 'misconfigured', detail: 'NEXT_PUBLIC_SUPABASE_URL missing' };
  }
  const secret = process.env.HIR_NOTIFY_SECRET ?? '';
  if (!secret) {
    return { ok: false, error: 'misconfigured', detail: 'HIR_NOTIFY_SECRET missing' };
  }

  let res: Response;
  try {
    res = await fetch(SMARTBILL_PUSH_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hir-notify-secret': secret,
      },
      body: JSON.stringify({ mode: 'test', tenant_id: tenantId }),
    });
  } catch (e) {
    return { ok: false, error: 'network', detail: (e as Error).message };
  }
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };
  await logAudit({
    tenantId,
    actorUserId: user.id,
    action: 'smartbill.test_connection',
    entityType: 'tenant',
    entityId: tenantId,
    metadata: { ok: data.ok === true, error: data.error ?? null },
  });
  revalidatePath('/dashboard/settings/smartbill');
  return data.ok === true
    ? { ok: true }
    : { ok: false, error: 'smartbill_rejected', detail: data.error ?? 'unknown' };
}

/**
 * Re-enqueue a FAILED job by flipping its status back to PENDING.
 * The cron pickup will retry it; respects MAX_ATTEMPTS in the function.
 */
export async function retrySmartbillJob(
  jobId: string,
  tenantId: string,
): Promise<SmartbillResult> {
  if (!jobId || !tenantId) return { ok: false, error: 'invalid_input' };
  const { user, tenant } = await getActiveTenant().catch(() => ({
    user: null,
    tenant: null,
  }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (tenant.id !== tenantId) return { ok: false, error: 'tenant_mismatch' };
  const role = await getTenantRole(user.id, tenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  const admin = createAdminClient();
  // smartbill_invoice_jobs is not yet in the generated supabase types
  // (migration 20260506_010_smartbill_integration.sql ships in this commit).
  // Cast through unknown so the call typechecks regardless.
  const sb = admin as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
    };
  };
  const { error } = await sb
    .from('smartbill_invoice_jobs')
    .update({ status: 'PENDING', error_text: null })
    .eq('id', jobId)
    .eq('tenant_id', tenantId)
    .eq('status', 'FAILED');
  if (error) {
    return { ok: false, error: 'db_error', detail: error.message };
  }
  await logAudit({
    tenantId,
    actorUserId: user.id,
    action: 'smartbill.invoice_retried',
    entityType: 'smartbill_invoice_jobs',
    entityId: jobId,
  });
  revalidatePath('/dashboard/settings/smartbill');
  return { ok: true };
}
