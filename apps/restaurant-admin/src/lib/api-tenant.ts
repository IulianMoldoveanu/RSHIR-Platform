import { NextResponse } from 'next/server';
import { createServerClient } from './supabase/server';
import { getActiveTenant } from './tenant';

export type ApiAuthSuccess = {
  ok: true;
  userId: string;
  tenantId: string;
  supabase: ReturnType<typeof createServerClient>;
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
      supabase: createServerClient(),
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
