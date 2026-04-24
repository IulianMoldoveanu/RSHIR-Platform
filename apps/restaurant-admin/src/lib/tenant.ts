// TODO(RSHIR-5): Replace with the real tenant-context helpers. The shape
// (getCurrentTenantId, assertTenantMember) is what RSHIR-7 mutations expect —
// keep these signatures stable so the menu module needs no edits at merge.
import { createServerClient } from './supabase/server';
import { createAdminClient } from './supabase/admin';

/**
 * Verifies that `userId` is a member of `tenantId`. Used as a guard before
 * any service-role write so the admin client cannot be tricked into writing
 * to another tenant.
 *
 * Sprint 1 will resolve the active tenant from a selector cookie / JWT claim.
 * Until then we read cookie `hir_active_tenant_id` directly.
 */
export async function assertTenantMember(userId: string, tenantId: string): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new Error(`Tenant membership check failed: ${error.message}`);
  if (!data) throw new Error('Forbidden: user is not a member of this tenant.');
}

/**
 * Resolves the active user + tenant in one call. Use this at the top of every
 * server action that mutates tenant-scoped data.
 */
export async function getActiveSession(): Promise<{ userId: string; tenantId: string }> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated.');

  const { cookies } = await import('next/headers');
  const tenantId = cookies().get('hir_active_tenant_id')?.value;
  if (!tenantId) throw new Error('No active tenant in session.');

  await assertTenantMember(user.id, tenantId);
  return { userId: user.id, tenantId };
}
