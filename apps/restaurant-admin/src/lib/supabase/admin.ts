// Service-role Supabase client. BYPASSES RLS — never feed it data straight from
// the request without first verifying tenant membership (see lib/tenant.ts).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@hir/supabase-types/database';

let cached: SupabaseClient<Database> | null = null;

export function createAdminClient(): SupabaseClient<Database> {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  cached = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
