'use server';

import { randomBytes, createHash } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';

const REVALIDATE = '/dashboard/settings/integrations/api';

export type SandboxKeyResult =
  | { ok: true; rawKey: string; keyPrefix: string }
  | { ok: false; error: string };

export type RevokeResult =
  | { ok: true }
  | { ok: false; error: string };

async function requireOwner(
  expectedTenantId: string,
): Promise<{ userId: string; tenantId: string } | { error: string }> {
  if (!expectedTenantId) return { error: 'missing_tenant_id' };
  const { user, tenant } = await getActiveTenant().catch(() => ({
    user: null as null,
    tenant: null as null,
  }));
  if (!user || !tenant) return { error: 'unauthenticated' };
  if (tenant.id !== expectedTenantId) return { error: 'tenant_mismatch' };
  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { error: 'forbidden' };
  return { userId: user.id, tenantId: expectedTenantId };
}

function sb() {
  const admin = createAdminClient();
  return admin as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{
            data: { id: string } | null;
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
    };
  };
}

export async function createSandboxKey(tenantId: string): Promise<SandboxKeyResult> {
  const guard = await requireOwner(tenantId);
  if ('error' in guard) return { ok: false, error: guard.error };

  const raw = `hir_${randomBytes(32).toString('base64url')}`;
  const hash = createHash('sha256').update(raw).digest('hex');
  const keyPrefix = raw.slice(0, 8);

  const { data, error } = await sb()
    .from('tenant_api_keys')
    .insert({
      tenant_id: guard.tenantId,
      key_hash: hash,
      key_prefix: keyPrefix,
      label: 'Sandbox',
      scopes: ['orders.write'],
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };

  await logAudit({
    tenantId: guard.tenantId,
    actorUserId: guard.userId,
    action: 'integration.api_key_created',
    entityType: 'tenant_api_key',
    entityId: data.id,
    metadata: { label: 'Sandbox', scopes: ['orders.write'] },
  });

  revalidatePath(REVALIDATE);
  return { ok: true, rawKey: raw, keyPrefix };
}

export async function revokeKey(keyId: string, tenantId: string): Promise<RevokeResult> {
  const guard = await requireOwner(tenantId);
  if ('error' in guard) return { ok: false, error: guard.error };

  const { error } = await sb()
    .from('tenant_api_keys')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
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
