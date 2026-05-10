import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
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
export async function getTenantRole(
  userId: string,
  tenantId: string,
): Promise<'OWNER' | 'STAFF' | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tenant_members')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new Error(`Tenant role lookup failed: ${error.message}`);
  if (!data) return null;
  return data.role === 'OWNER' ? 'OWNER' : 'STAFF';
}

/**
 * Use inside route handlers / server actions that mutate tenant-level config
 * (custom domain, etc.) where only OWNERs may write.
 */
export async function assertTenantOwner(
  userId: string,
  tenantId: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  try {
    const role = await getTenantRole(userId, tenantId);
    if (role !== 'OWNER') {
      return {
        ok: false,
        response: NextResponse.json({ error: 'forbidden_owner_only' }, { status: 403 }),
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: e instanceof Error ? e.message : 'role_check_failed' },
        { status: 400 },
      ),
    };
  }
}

/**
 * True when the user can mutate delivery zones / pricing tiers for this
 * tenant. OWNER bypasses the flag; non-OWNER members need an explicit
 * `can_manage_zones = true` row in tenant_members. Use this from API
 * route guards and from the zones page UI.
 */
export async function canManageZones(
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  // can_manage_zones lands via migration 20260603_001 and is not yet in
  // the generated @hir/supabase-types union; cast the query through any
  // so tsc accepts the select. Runtime is a normal column lookup.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin.from('tenant_members') as any)
    .select('role, can_manage_zones')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) {
    const msg = (error as { message?: string }).message ?? 'unknown';
    throw new Error(`Tenant capability lookup failed: ${msg}`);
  }
  if (!data) return false;
  const row = data as unknown as { role: string; can_manage_zones?: boolean };
  if (row.role === 'OWNER') return true;
  return row.can_manage_zones === true;
}

export async function assertTenantMember(userId: string, tenantId: string): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new Error(`Tenant membership check failed: ${error.message}`);
  if (!data) throw new Error('Forbidden: user is not a member of this restaurant.');
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
function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

async function listAllActiveTenants(): Promise<TenantSummary[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tenants')
    .select('id, name, slug')
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load tenants: ${error.message}`);
  return (data ?? []) as TenantSummary[];
}

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

  let tenants = await listMemberTenants(user.id);

  // Platform admins (allow-list via HIR_PLATFORM_ADMIN_EMAILS) can land in
  // the dashboard without being members of any tenant — they read all
  // ACTIVE tenants so the TenantSelector + admin pages have something to
  // bind to. Admin-only sub-routes still re-check the allow-list, so this
  // does not widen write access.
  if (tenants.length === 0 && isPlatformAdminEmail(user.email)) {
    tenants = await listAllActiveTenants();
  }

  if (tenants.length === 0) throw new Error('User is not a member of any restaurant.');

  const cookieTenantId = cookies().get(TENANT_COOKIE)?.value;
  const tenant =
    tenants.find((t) => t.id === cookieTenantId) ?? tenants[0];

  return {
    user: { id: user.id, email: user.email ?? null },
    tenant,
    tenants,
  };
}
