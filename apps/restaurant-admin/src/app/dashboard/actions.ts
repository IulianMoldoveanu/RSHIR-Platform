'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { TENANT_COOKIE, assertTenantMember } from '@/lib/tenant';

export async function selectTenantAction(formData: FormData) {
  const tenantId = String(formData.get('tenantId') ?? '');
  if (!tenantId) return;

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  await assertTenantMember(user.id, tenantId);

  cookies().set(TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  redirect('/dashboard');
}

export async function logoutAction() {
  const supabase = createServerClient();
  await supabase.auth.signOut();
  cookies().delete(TENANT_COOKIE);
  redirect('/login');
}
