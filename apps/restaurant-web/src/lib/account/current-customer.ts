import 'server-only';
import { cookies, type UnsafeUnwrappedCookies } from 'next/headers';
import { createServerSupabase } from '@hir/supabase-types';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Resolves the customers.id for the CURRENT Supabase Auth session, scoped
 * to the given tenant. Returns null when there's no session, or when the
 * session exists but has no customers row for this tenant yet (shouldn't
 * normally happen post-login — ensure-customer runs right after auth — but
 * callers must treat it as "not authenticated for this tenant", not throw).
 */
export async function getCurrentCustomerId(tenantId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createServerSupabase(SUPABASE_URL, SUPABASE_ANON_KEY, cookieStore as unknown as UnsafeUnwrappedCookies);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from('customers')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('auth_user_id', user.id)
    .maybeSingle();
  return data?.id ?? null;
}
