import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@hir/supabase-types';

let cached: SupabaseClient<Database> | null = null;

/**
 * Service-role Supabase client. Bypasses RLS — use ONLY on the server.
 *
 * Used for:
 *   - Inserting orders (anon has no insert policy on `restaurant_orders`).
 *   - Calling security-definer RPCs that scope sensitive reads at the DB
 *     layer (e.g. `get_public_order(token uuid)` for the anonymous /track
 *     page — see supabase/migrations/20260506_007_get_public_order_rpc.sql).
 */
export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase admin env not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }
  cached = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
