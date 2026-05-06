'use server';

// Lane ANAF-EFACTURA — server actions for the 4-step wizard.
//
// Mirrors apps/restaurant-admin/src/app/dashboard/settings/smartbill/actions.ts
// in shape + audit conventions. Sensitive values go to Supabase Vault via
// the existing hir_{read,write,delete}_vault_secret RPCs (added in
// supabase/migrations/20260506_010_smartbill_integration.sql). No new
// migration ships in this lane.
//
// Step 1: CIF + form 084 acknowledged   → settings only
// Step 2: OAuth app client_id + secret  → client_id in jsonb, secret in vault
// Step 3: .p12 cert + password          → both in vault (base64 blob + pwd)
// Step 4: Test connection               → calls placeholder Edge Function

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';
import {
  isValidCertBase64,
  isValidCertPassword,
  isValidEnvironment,
  isValidOauthClientId,
  isValidOauthClientSecret,
  normalizeCif,
  readEfacturaSettings,
  type EfacturaEnvironment,
  type EfacturaSettings,
  type EfacturaStep,
} from '@/lib/efactura';

export type EfacturaResult =
  | { ok: true }
  | { ok: false; error: string; detail?: string };

type AdminLike = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const EFACTURA_TEST_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/efactura-test`
  : null;

function vaultCertKey(tenantId: string): string {
  return `efactura_cert_p12_${tenantId}`;
}
function vaultCertPasswordKey(tenantId: string): string {
  return `efactura_cert_password_${tenantId}`;
}
function vaultOauthSecretKey(tenantId: string): string {
  return `efactura_oauth_client_secret_${tenantId}`;
}

/**
 * Helper — auth + role guard shared by all four step actions. Returns the
 * resolved tenant + user, or a typed error result that the caller can
 * forward to the client.
 */
async function authGuard(
  expectedTenantId: string,
): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string; detail?: string }
> {
  if (!expectedTenantId) {
    return { ok: false, error: 'invalid_input', detail: 'tenantId' };
  }
  const { user, tenant } = await getActiveTenant().catch(() => ({
    user: null,
    tenant: null,
  }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (tenant.id !== expectedTenantId) return { ok: false, error: 'tenant_mismatch' };
  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };
  return { ok: true, userId: user.id };
}

/**
 * Read-merge-write the jsonb `settings.efactura` block. Avoids clobbering
 * unrelated keys (e.g. settings.smartbill, settings.fiscal).
 */
async function patchEfacturaSettings(
  tenantId: string,
  patch: Partial<EfacturaSettings>,
): Promise<{ ok: true } | { ok: false; error: string; detail?: string }> {
  const admin = createAdminClient();
  const { data: tenantRow, error: readErr } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single();
  if (readErr || !tenantRow) {
    return {
      ok: false,
      error: 'db_error',
      detail: readErr?.message ?? 'tenant_not_found',
    };
  }
  const currentSettings =
    tenantRow.settings && typeof tenantRow.settings === 'object'
      ? (tenantRow.settings as Record<string, unknown>)
      : {};
  const currentEf = readEfacturaSettings(currentSettings);
  const nextEf: EfacturaSettings = { ...currentEf, ...patch };

  const { error: writeErr } = await admin
    .from('tenants')
    .update({ settings: { ...currentSettings, efactura: nextEf } })
    .eq('id', tenantId);
  if (writeErr) {
    return { ok: false, error: 'db_error', detail: writeErr.message };
  }
  return { ok: true };
}

/**
 * Step 1 — record CIF + acknowledgement that the OWNER has filed Formular
 * 084 (e-Factura B2C opt-in) in SPV. We never check ANAF for this — the
 * OWNER ticks the box and we audit it. `step_completed` advances to 1.
 */
export async function saveStep1Cif(formData: FormData): Promise<EfacturaResult> {
  const expectedTenantId = String(formData.get('tenantId') ?? '');
  const cifInput = String(formData.get('cif') ?? '').trim();
  const form084 = formData.get('form_084_acknowledged') === 'on';

  const cif = normalizeCif(cifInput);
  if (!cif) return { ok: false, error: 'invalid_input', detail: 'cif' };
  if (!form084) {
    return { ok: false, error: 'invalid_input', detail: 'form_084_acknowledged' };
  }

  const guard = await authGuard(expectedTenantId);
  if (!guard.ok) return guard;

  const r = await patchEfacturaSettings(expectedTenantId, {
    cif,
    form_084_accepted_at: new Date().toISOString(),
    step_completed: Math.max(1, 1) as EfacturaStep,
  });
  if (!r.ok) return r;

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: guard.userId,
    action: 'efactura.config_step_completed',
    entityType: 'tenant',
    entityId: expectedTenantId,
    metadata: { step: 1, cif },
  });

  revalidatePath('/dashboard/settings/efactura');
  return { ok: true };
}

/**
 * Step 2 — capture OAuth app client_id (jsonb) + client_secret (vault).
 * Empty client_secret = "leave existing alone". `__CLEAR__` sentinel = remove.
 */
export async function saveStep2Oauth(formData: FormData): Promise<EfacturaResult> {
  const expectedTenantId = String(formData.get('tenantId') ?? '');
  const clientId = String(formData.get('oauth_client_id') ?? '').trim();
  const clientSecretInput = String(formData.get('oauth_client_secret') ?? '');
  const environmentRaw = String(formData.get('environment') ?? 'test').trim();

  if (!isValidOauthClientId(clientId)) {
    return { ok: false, error: 'invalid_input', detail: 'oauth_client_id' };
  }
  if (!isValidEnvironment(environmentRaw)) {
    return { ok: false, error: 'invalid_input', detail: 'environment' };
  }
  const environment: EfacturaEnvironment = environmentRaw;

  const guard = await authGuard(expectedTenantId);
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  let secretAction: 'kept' | 'set' | 'cleared' = 'kept';
  if (clientSecretInput === '__CLEAR__') {
    const { error } = await (admin as unknown as AdminLike).rpc(
      'hir_delete_vault_secret',
      { secret_name: vaultOauthSecretKey(expectedTenantId) },
    );
    if (error) {
      return {
        ok: false,
        error: 'db_error',
        detail: `vault_delete: ${error.message}`,
      };
    }
    secretAction = 'cleared';
  } else if (clientSecretInput.length > 0) {
    if (!isValidOauthClientSecret(clientSecretInput)) {
      return {
        ok: false,
        error: 'invalid_input',
        detail: 'oauth_client_secret',
      };
    }
    const { error } = await (admin as unknown as AdminLike).rpc(
      'hir_write_vault_secret',
      {
        secret_name: vaultOauthSecretKey(expectedTenantId),
        secret_value: clientSecretInput.trim(),
        secret_description: `ANAF e-Factura OAuth client_secret for tenant ${expectedTenantId}`,
      },
    );
    if (error) {
      return {
        ok: false,
        error: 'db_error',
        detail: `vault_write: ${error.message}`,
      };
    }
    secretAction = 'set';
  }

  // Read current step so we don't regress.
  const { data: tenantRow } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', expectedTenantId)
    .single();
  const currentEf = readEfacturaSettings(tenantRow?.settings);

  const r = await patchEfacturaSettings(expectedTenantId, {
    oauth_client_id: clientId,
    environment,
    step_completed: (Math.max(currentEf.step_completed, 2) as EfacturaStep),
  });
  if (!r.ok) return r;

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: guard.userId,
    action: 'efactura.config_step_completed',
    entityType: 'tenant',
    entityId: expectedTenantId,
    metadata: { step: 2, environment, secret_action: secretAction },
  });
  if (secretAction === 'set') {
    await logAudit({
      tenantId: expectedTenantId,
      actorUserId: guard.userId,
      action: 'efactura.token_set',
      entityType: 'tenant',
      entityId: expectedTenantId,
      metadata: { kind: 'oauth_client_secret' },
    });
  } else if (secretAction === 'cleared') {
    await logAudit({
      tenantId: expectedTenantId,
      actorUserId: guard.userId,
      action: 'efactura.token_cleared',
      entityType: 'tenant',
      entityId: expectedTenantId,
      metadata: { kind: 'oauth_client_secret' },
    });
  }

  revalidatePath('/dashboard/settings/efactura');
  return { ok: true };
}

/**
 * Step 3 — upload .p12 cert (base64) + password. Both go to Vault.
 * Empty cert = "leave existing alone". `__CLEAR__` sentinel = remove both.
 */
export async function saveStep3Cert(formData: FormData): Promise<EfacturaResult> {
  const expectedTenantId = String(formData.get('tenantId') ?? '');
  const certBase64Input = String(formData.get('cert_base64') ?? '');
  const certPasswordInput = String(formData.get('cert_password') ?? '');

  const guard = await authGuard(expectedTenantId);
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  let certAction: 'kept' | 'set' | 'cleared' = 'kept';

  if (certBase64Input === '__CLEAR__') {
    const { error: e1 } = await (admin as unknown as AdminLike).rpc(
      'hir_delete_vault_secret',
      { secret_name: vaultCertKey(expectedTenantId) },
    );
    if (e1) {
      return {
        ok: false,
        error: 'db_error',
        detail: `vault_delete_cert: ${e1.message}`,
      };
    }
    const { error: e2 } = await (admin as unknown as AdminLike).rpc(
      'hir_delete_vault_secret',
      { secret_name: vaultCertPasswordKey(expectedTenantId) },
    );
    if (e2) {
      return {
        ok: false,
        error: 'db_error',
        detail: `vault_delete_password: ${e2.message}`,
      };
    }
    certAction = 'cleared';
  } else if (certBase64Input.length > 0) {
    if (!isValidCertBase64(certBase64Input)) {
      return { ok: false, error: 'invalid_input', detail: 'cert_base64' };
    }
    if (!isValidCertPassword(certPasswordInput)) {
      return { ok: false, error: 'invalid_input', detail: 'cert_password' };
    }
    // Write cert blob first, then password. If password write fails after
    // cert write succeeds, we end up with cert-without-password — surface
    // the error and rely on the OWNER to retry; we don't try to roll back
    // because Vault delete may itself fail and leave a worse state.
    const { error: e1 } = await (admin as unknown as AdminLike).rpc(
      'hir_write_vault_secret',
      {
        secret_name: vaultCertKey(expectedTenantId),
        secret_value: certBase64Input.trim(),
        secret_description: `ANAF e-Factura .p12 cert (base64) for tenant ${expectedTenantId}`,
      },
    );
    if (e1) {
      return {
        ok: false,
        error: 'db_error',
        detail: `vault_write_cert: ${e1.message}`,
      };
    }
    const { error: e2 } = await (admin as unknown as AdminLike).rpc(
      'hir_write_vault_secret',
      {
        secret_name: vaultCertPasswordKey(expectedTenantId),
        secret_value: certPasswordInput,
        secret_description: `ANAF e-Factura .p12 password for tenant ${expectedTenantId}`,
      },
    );
    if (e2) {
      return {
        ok: false,
        error: 'db_error',
        detail: `vault_write_password: ${e2.message}`,
      };
    }
    certAction = 'set';
  } else {
    return { ok: false, error: 'invalid_input', detail: 'cert_base64' };
  }

  const { data: tenantRow } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', expectedTenantId)
    .single();
  const currentEf = readEfacturaSettings(tenantRow?.settings);

  const r = await patchEfacturaSettings(expectedTenantId, {
    step_completed:
      certAction === 'cleared'
        ? (Math.min(currentEf.step_completed, 2) as EfacturaStep)
        : (Math.max(currentEf.step_completed, 3) as EfacturaStep),
  });
  if (!r.ok) return r;

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: guard.userId,
    action: 'efactura.cert_uploaded',
    entityType: 'tenant',
    entityId: expectedTenantId,
    metadata: { cert_action: certAction },
  });
  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: guard.userId,
    action: 'efactura.config_step_completed',
    entityType: 'tenant',
    entityId: expectedTenantId,
    metadata: { step: 3, cert_action: certAction },
  });

  revalidatePath('/dashboard/settings/efactura');
  return { ok: true };
}

/**
 * Step 4 — fire the placeholder `efactura-test` Edge Function. Returns 501
 * today (no real ANAF call yet). The function shape is defined so the live
 * call can drop in later without UI changes.
 */
export async function testEfacturaConnection(
  tenantId: string,
): Promise<EfacturaResult> {
  const guard = await authGuard(tenantId);
  if (!guard.ok) return guard;

  if (!EFACTURA_TEST_URL) {
    return {
      ok: false,
      error: 'misconfigured',
      detail: 'NEXT_PUBLIC_SUPABASE_URL missing',
    };
  }
  const secret = process.env.HIR_NOTIFY_SECRET ?? '';
  if (!secret) {
    return {
      ok: false,
      error: 'misconfigured',
      detail: 'HIR_NOTIFY_SECRET missing',
    };
  }

  let res: Response;
  try {
    res = await fetch(EFACTURA_TEST_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hir-notify-secret': secret,
      },
      body: JSON.stringify({ tenant_id: tenantId }),
    });
  } catch (e) {
    return { ok: false, error: 'network', detail: (e as Error).message };
  }
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    detail?: string;
  };

  // Persist the test result regardless — the OWNER wants to see "last test
  // failed at HH:mm" even before the real ANAF call is wired up.
  const nowIso = new Date().toISOString();
  await patchEfacturaSettings(tenantId, {
    last_test_status: data.ok === true ? 'OK' : 'FAILED',
    last_test_at: nowIso,
    last_test_error: data.ok === true ? null : data.error ?? data.detail ?? 'unknown',
  });

  await logAudit({
    tenantId,
    actorUserId: guard.userId,
    action: 'efactura.test_connection',
    entityType: 'tenant',
    entityId: tenantId,
    metadata: {
      ok: data.ok === true,
      error: data.error ?? null,
      http_status: res.status,
    },
  });

  if (data.ok === true) {
    // Advance step + flip enabled. (Won't happen until the placeholder is
    // replaced with a real ANAF call — kept here so the live wiring is a
    // one-line Edge Function change.)
    await patchEfacturaSettings(tenantId, {
      step_completed: 4,
      enabled: true,
    });
    await logAudit({
      tenantId,
      actorUserId: guard.userId,
      action: 'efactura.config_step_completed',
      entityType: 'tenant',
      entityId: tenantId,
      metadata: { step: 4 },
    });
  }

  revalidatePath('/dashboard/settings/efactura');

  if (data.ok === true) return { ok: true };
  if (res.status === 501) {
    // Placeholder function — surface a clear "not yet wired" message to UI.
    return {
      ok: false,
      error: 'not_implemented',
      detail: data.detail ?? 'efactura-test placeholder',
    };
  }
  return {
    ok: false,
    error: 'anaf_rejected',
    detail: data.error ?? data.detail ?? 'unknown',
  };
}
