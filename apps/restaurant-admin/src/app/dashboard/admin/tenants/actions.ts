'use server';

// Platform-admin "open tenant" — switches the TENANT_COOKIE so the next
// /dashboard render scopes to the chosen tenant. Unlike onboard/actions.ts
// switchToTenantAction (which requires the caller to be a tenant_member),
// this is for HIR_PLATFORM_ADMIN_EMAILS-allowed users who are NOT members
// of every tenant on the platform. The allow-list itself is the auth.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TENANT_COOKIE } from '@/lib/tenant';

function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}

export async function openTenantAsPlatformAdmin(formData: FormData): Promise<void> {
  const tenantId = String(formData.get('tenantId') ?? '');
  if (!tenantId) throw new Error('missing_tenant_id');

  const supa = createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) throw new Error('unauthenticated');
  if (!isPlatformAdmin(user.email)) throw new Error('forbidden');

  // Verify the tenant exists (defensive — prevents setting cookie to a bogus uuid).
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data, error } = await sb
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('tenant_not_found');

  cookies().set(TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect('/dashboard');
}
