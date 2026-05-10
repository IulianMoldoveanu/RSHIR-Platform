import { NextResponse } from 'next/server';
import { createServerClient } from './supabase/server';
import { canManageZones, getActiveTenant } from './tenant';

export type ApiAuthSuccess = {
  ok: true;
  userId: string;
  tenantId: string;
  supabase: Awaited<ReturnType<typeof createServerClient>>;
};

export type ApiAuthFailure = {
  ok: false;
  response: NextResponse;
};

export async function requireTenantAuth(): Promise<ApiAuthSuccess | ApiAuthFailure> {
  try {
    const { user, tenant } = await getActiveTenant();
    return {
      ok: true,
      userId: user.id,
      tenantId: tenant.id,
      supabase: await createServerClient(),
    };
  } catch (e) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: e instanceof Error ? e.message : 'Unauthorized' },
        { status: 401 },
      ),
    };
  }
}

/**
 * Same as requireTenantAuth but additionally rejects callers who do not
 * have `can_manage_zones` (OWNER bypasses). Use on every zone or pricing
 * tier mutation route handler.
 */
export async function requireZoneManager(): Promise<ApiAuthSuccess | ApiAuthFailure> {
  const auth = await requireTenantAuth();
  if (!auth.ok) return auth;
  let allowed = false;
  try {
    allowed = await canManageZones(auth.userId, auth.tenantId);
  } catch (e) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: e instanceof Error ? e.message : 'capability_check_failed' },
        { status: 500 },
      ),
    };
  }
  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'forbidden_zone_manager_only' },
        { status: 403 },
      ),
    };
  }
  return auth;
}
