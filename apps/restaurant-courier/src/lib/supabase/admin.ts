// Service-role Supabase client. BYPASSES RLS — only use server-side after
// validating the caller (auth.uid(), Bearer API key, etc.).
//
// NOTE 2026-06-16 — this client is intentionally returned UNTYPED
// (`SupabaseClient` without a `<Database>` generic) for back-compat with the
// ~30 existing call sites that hit tables not present in the generated
// `@hir/supabase-types/database` (e.g. courier_kyc, courier_tips,
// courier_call_sessions, pharma_ready_at column on courier_orders, etc.).
// Adding the generic would surface dozens of `SelectQueryError<...>` type
// errors that are NOT real bugs (the queries work at runtime — the type
// generator is just stale). When `pnpm --filter @hir/supabase-types gen`
// is re-run against the live qfme schema, we can flip this to
// `SupabaseClient<Database>` and tighten the call sites.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

// Alias kept for parity with restaurant-admin's helper of the same name.
// At this point in the courier app the base client is already untyped, so
// this is a no-op shape — but call sites use this name to make the
// "schema-drift escape hatch" intent explicit, and we can swap the underlying
// implementation in one place once the generated types are refreshed.
//
// CLAUDE.md §5.3 type-honesty: centralizes the type-relaxation in ONE place
// instead of duplicating `createAdminClient() as any` across many call sites.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAdminClientUntyped(): any {
  return createAdminClient();
}
