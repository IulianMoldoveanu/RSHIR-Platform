'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { TENANT_COOKIE, assertTenantMember } from '@/lib/tenant';

export async function selectTenantAction(formData: FormData) {
  const tenantId = String(formData.get('tenantId') ?? '');
  if (!tenantId) return;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  await assertTenantMember(user.id, tenantId);

  const cookieStore = await cookies();
  cookieStore.set(TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  redirect('/dashboard');
}

export async function logoutAction() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(TENANT_COOKIE);
  redirect('/login');
}
