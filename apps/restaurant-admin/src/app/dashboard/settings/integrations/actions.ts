'use server';

// RSHIR-52: Server actions for integrations settings.
// All actions are OWNER-gated and use the requireTenant + requireOwner guard
// following the same pattern as orders/actions.ts.

import { randomBytes } from 'crypto';
import { createHash } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';

const REVALIDATE = '/dashboard/settings/integrations';

export type IntegrationActionResult =
  | { ok: true; data?: Record<string, unknown> }
  | { ok: false; error: string };

async function requireOwner(
  expectedTenantId: string,
): Promise<{ userId: string; tenantId: string } | { error: string }> {
  if (!expectedTenantId) return { error: 'missing_tenant_id' };
  const { user, tenant } = await getActiveTenant().catch(() => ({
    user: null as null,
    tenant: null as null,
  }));
  if (!user || !tenant) return { error: 'Unauthentificat.' };
  if (tenant.id !== expectedTenantId) return { error: 'tenant_mismatch' };
  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { error: 'Acces interzis: doar OWNER poate modifica integrările.' };
  return { userId: user.id, tenantId: expectedTenantId };
}

// Cast helper — integration tables are not yet in the generated Supabase types.
function integrationSb() {
  const admin = createAdminClient();
  return admin as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => Promise<{
            error: { message: string } | null;
          }>;
        };
      };
      delete: () => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => Promise<{
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
}

export async function addProvider(
  expectedTenantId: string,
  providerKey: string,
  displayName: string,
  configJson: Record<string, unknown>,
  webhookSecret: string,
): Promise<IntegrationActionResult> {
  const guard = await requireOwner(expectedTenantId);
  if ('error' in guard) return { ok: false, error: guard.error };

  const sb = integrationSb();
  const { error } = await sb
    .from('integration_providers')
    .insert({
      tenant_id: guard.tenantId,
      provider_key: providerKey,
      display_name: displayName,
      config: configJson,
      webhook_secret: webhookSecret,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  await logAudit({
    tenantId: guard.tenantId,
    actorUserId: guard.userId,
    action: 'integration.provider_added',
    entityType: 'integration_provider',
    metadata: { provider_key: providerKey, display_name: displayName },
  });

  revalidatePath(REVALIDATE);
  return { ok: true };
}

export async function removeProvider(
  expectedTenantId: string,
  providerId: string,
): Promise<IntegrationActionResult> {
  const guard = await requireOwner(expectedTenantId);
  if ('error' in guard) return { ok: false, error: guard.error };

  const sb = integrationSb();
  const { error } = await sb
    .from('integration_providers')
    .delete()
    .eq('id', providerId)
    .eq('tenant_id', guard.tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    tenantId: guard.tenantId,
    actorUserId: guard.userId,
    action: 'integration.provider_removed',
    entityType: 'integration_provider',
    entityId: providerId,
  });

  revalidatePath(REVALIDATE);
  return { ok: true };
}

export type CreateApiKeyResult =
  | { ok: true; rawKey: string }
  | { ok: false; error: string };

export async function createApiKey(
  expectedTenantId: string,
  label: string,
  scopes: string[],
): Promise<CreateApiKeyResult> {
  const guard = await requireOwner(expectedTenantId);
  if ('error' in guard) return { ok: false, error: guard.error };

  const raw = `hir_${randomBytes(32).toString('base64url')}`;
  const hash = createHash('sha256').update(raw).digest('hex');

  const sb = integrationSb();
  const { data, error } = await sb
    .from('tenant_api_keys')
    .insert({
      tenant_id: guard.tenantId,
      key_hash: hash,
      label,
      scopes,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };

  await logAudit({
    tenantId: guard.tenantId,
    actorUserId: guard.userId,
    action: 'integration.api_key_created',
    entityType: 'tenant_api_key',
    entityId: String(data.id),
    metadata: { label, scopes },
  });

  revalidatePath(REVALIDATE);
  return { ok: true, rawKey: raw };
}

export async function revokeApiKey(
  expectedTenantId: string,
  keyId: string,
): Promise<IntegrationActionResult> {
  const guard = await requireOwner(expectedTenantId);
  if ('error' in guard) return { ok: false, error: guard.error };

  const sb = integrationSb();
  const { error } = await sb
    .from('tenant_api_keys')
    .update({ is_active: false })
    .eq('id', keyId)
    .eq('tenant_id', guard.tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    tenantId: guard.tenantId,
    actorUserId: guard.userId,
    action: 'integration.api_key_revoked',
    entityType: 'tenant_api_key',
    entityId: keyId,
  });

  revalidatePath(REVALIDATE);
  return { ok: true };
}
