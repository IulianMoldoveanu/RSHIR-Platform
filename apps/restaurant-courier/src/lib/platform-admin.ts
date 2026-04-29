// Guard for platform-admin-only server actions and pages.
// Checks if the calling Supabase auth user has a row in public.platform_admins.
// Throws (or returns error string) so callers can redirect / return 403.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function requirePlatformAdmin(): Promise<{ userId: string }> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data } = await admin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) redirect('/dashboard');

  return { userId: user.id };
}

/** Same check but returns a result instead of redirecting — use in server actions. */
export async function checkPlatformAdmin(): Promise<{ userId: string } | { error: string }> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Unauthentificat.' };

  const admin = createAdminClient();
  const { data } = await admin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) return { error: 'Acces interzis: doar PLATFORM_ADMIN.' };

  return { userId: user.id };
}
