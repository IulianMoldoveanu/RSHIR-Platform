import { cookies } from 'next/headers';
import { createServerClient } from './supabase/server';
import { createAdminClient } from './supabase/admin';

export const TENANT_COOKIE = 'selected_tenant_id';

export type TenantSummary = {
  id: string;
  name: string;
  slug: string;
};

/**
 * Verifies that `userId` is a member of `tenantId`. Used as a guard before
 * any service-role write so the admin client cannot be tricked into writing
 * to another tenant.
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
 * Lists tenants the current user is a member of. Used to populate the tenant
 * selector dropdown in the dashboard top bar.
 */
export async function listMemberTenants(userId: string): Promise<TenantSummary[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tenant_members')
    .select('tenant_id, tenants:tenants(id, name, slug)')
    .eq('user_id', userId);
  if (error) throw new Error(`Failed to load tenants: ${error.message}`);
  return (data ?? [])
    .map((row: any) => row.tenants)
    .filter(Boolean) as TenantSummary[];
}

/**
 * Reads `selected_tenant_id` cookie and returns the active tenant if the user
 * is a member. Falls back to the first membership when no cookie is set.
 */
export async function getActiveTenant(): Promise<{
  user: { id: string; email: string | null };
  tenant: TenantSummary;
  tenants: TenantSummary[];
}> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated.');

  const tenants = await listMemberTenants(user.id);
  if (tenants.length === 0) throw new Error('User is not a member of any tenant.');

  const cookieTenantId = cookies().get(TENANT_COOKIE)?.value;
  const tenant =
    tenants.find((t) => t.id === cookieTenantId) ?? tenants[0];

  return {
    user: { id: user.id, email: user.email ?? null },
    tenant,
    tenants,
  };
}
