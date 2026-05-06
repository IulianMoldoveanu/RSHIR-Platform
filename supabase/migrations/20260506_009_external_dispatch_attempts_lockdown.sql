-- Security sweep 2026-05-06 — close cross-tenant leak on
-- public.external_dispatch_attempts.
--
-- Background: migration 20260506_001_fleet_manager_multi_tenant_option_a.sql
-- created the table with a comment "service_role only writes/reads", but
-- forgot to enable RLS AND forgot to revoke the default SELECT/INSERT/
-- UPDATE/DELETE grants that Supabase auto-applies to anon + authenticated
-- on every public-schema table. Result: any holder of the public anon key
-- (which ships in every storefront page as NEXT_PUBLIC_SUPABASE_ANON_KEY)
-- could read all tenants' Fleet Manager dispatch webhook attempt logs —
-- request_url, response_body_excerpt, error_message — and could insert
-- fake rows or TRUNCATE the table.
--
-- The table is empty in production (was created today, no FM dispatch has
-- fired yet), so no real data has leaked, but the path is open and the
-- leaked rows would name internal Fleet Network webhooks which violates
-- the Fleet Network confidentiality rule (STRATEGY.md line 28).
--
-- Fix: enable RLS (deny-by-default to anon/authenticated since no
-- policies exist) AND explicitly REVOKE all grants from anon +
-- authenticated for defense-in-depth. service_role bypasses RLS by design
-- and retains its grants — production code-paths are unaffected.
--
-- Idempotent: alter table ... enable row level security and revoke ...
-- are safe to re-run. Running this migration twice is a no-op.

alter table public.external_dispatch_attempts enable row level security;

revoke all on table public.external_dispatch_attempts from anon;
revoke all on table public.external_dispatch_attempts from authenticated;

-- Sanity check: service_role still has access (this is a privileged role
-- inside the database; the grant is not visible in information_schema for
-- the same reason postgres role isn't, but Supabase guarantees it).

comment on table public.external_dispatch_attempts is
  'Audit log of webhook POSTs to external Fleet Manager dispatch endpoints. Internal-only. Service role write-only. RLS enabled + anon/authenticated grants revoked 2026-05-06 security sweep.';
