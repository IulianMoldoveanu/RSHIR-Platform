'use server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';

export type TeamActionResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | 'unauthenticated'
        | 'forbidden_owner_only'
        | 'invalid_input'
        | 'cannot_modify_owner'
        | 'member_not_found'
        | 'db_error';
      detail?: string;
    };

/**
 * Toggle the can_manage_zones flag for a non-OWNER member of the active
 * tenant. OWNER-only. OWNERs always have the capability implicitly and
 * cannot be downgraded through this surface (would require changing the
 * role in tenant_members directly).
 */
export async function setMemberZoneCapability(
  memberUserId: string,
  expectedTenantId: string,
  allowed: boolean,
): Promise<TeamActionResult> {
  const { user, tenant } = await getActiveTenant().catch(() => ({
    user: null,
    tenant: null,
  }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (!expectedTenantId || tenant.id !== expectedTenantId) {
    return { ok: false, error: 'invalid_input', detail: 'tenant_mismatch' };
  }
  if (!memberUserId) return { ok: false, error: 'invalid_input' };

  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  const admin = createAdminClient();
  const { data: targetRow, error: lookupErr } = await admin
    .from('tenant_members')
    .select('user_id, role')
    .eq('user_id', memberUserId)
    .eq('tenant_id', expectedTenantId)
    .maybeSingle();
  if (lookupErr) {
    console.error('[team] member lookup failed', {
      tenantId: expectedTenantId,
      memberUserId,
      message: lookupErr.message,
    });
    return { ok: false, error: 'db_error' };
  }
  if (!targetRow) return { ok: false, error: 'member_not_found' };
  if (targetRow.role === 'OWNER') {
    // OWNERs implicitly have the capability; the toggle is a no-op for them.
    return { ok: false, error: 'cannot_modify_owner' };
  }

  // can_manage_zones lives on tenant_members but is not in the generated
  // Supabase types until the next codegen run; cast through unknown.
  const update = { can_manage_zones: allowed } as unknown as Record<string, unknown>;
  const { error: writeErr } = await admin
    .from('tenant_members')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(update as any)
    .eq('user_id', memberUserId)
    .eq('tenant_id', expectedTenantId);
  if (writeErr) {
    console.error('[team] capability update failed', {
      tenantId: expectedTenantId,
      memberUserId,
      message: writeErr.message,
    });
    return { ok: false, error: 'db_error' };
  }

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: user.id,
    action: allowed ? 'team.zone_capability_granted' : 'team.zone_capability_revoked',
    entityType: 'tenant_member',
    entityId: memberUserId,
    metadata: { can_manage_zones: allowed },
  });

  revalidatePath('/dashboard/settings/team');
  return { ok: true };
}
