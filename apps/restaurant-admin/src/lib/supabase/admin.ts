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

// Escape hatch for callers that hit tables NOT yet present in the generated
// `Database` type (schema drift: fleet_kyf, fleet_courier_tariffs,
// fleet_vendor_tariffs, hepi_settings, partner_users, partner_team, etc.).
//
// TODO(supabase-types): regenerate `@hir/supabase-types` via
// `pnpm --filter @hir/supabase-types gen` against the live qfme schema; once
// the missing tables are present, migrate callers back to createAdminClient()
// and remove this export. Tracking issue: schema drift between supabase prod
// and the generated types as of 2026-06-16.
//
// Centralized here so the type-relaxation lives in ONE place instead of being
// duplicated as `createAdminClient() as any` across many call sites (CLAUDE.md
// §5.3 type-honesty: "use a properly-typed local interface for just that
// query" — this helper is that single escape point).
//
// Returns `any` (not `SupabaseClient<any,any,any>`) because the latter still
// narrows row shapes on .from(table) via overload resolution, which clashes
// with hand-rolled `.map((r: {...}) => ...)` annotations at the call sites
// (TS infers element shape as the multi-relation embed and rejects the
// single-relation annotation). Fully untyped collapses all of that to `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAdminClientUntyped(): any {
  return createAdminClient();
}
