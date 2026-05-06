-- Security sweep v2 (2026-05-06 PM) — defense-in-depth grant lockdown on
-- new tables shipped by today's BEAST run.
--
-- Background: today's morning sweep landed migration 20260506_009 to fix a
-- P0 cross-tenant leak on `external_dispatch_attempts` — RLS was disabled
-- AND default `anon`/`authenticated` table grants were intact, so the
-- public anon key could read all tenants' Fleet Manager webhook attempts.
--
-- This afternoon's sweep audited the rest of today's new tables and found
-- the same defense-in-depth gap on three more:
--
--   - `fm_invites` (PR #284): RLS enabled, OWNER-read policy in place, but
--     anon/authenticated still hold full SELECT/INSERT/UPDATE/DELETE
--     grants from the default public-schema permissions. Today the policy
--     denies non-OWNER reads correctly (verified: anon SELECT returns
--     `200 []`). But if anyone ever adds a permissive policy to the table
--     later (e.g. "let any authenticated user list pending invites"), the
--     wide grants would suddenly leak invite tokens by hash.
--
--   - `function_runs` (PR #281): RLS enabled with NO policies, so deny-all
--     is the current behaviour by absence — but again the grants are wide.
--     A future "let authenticated read their own tenant's runs" policy
--     would unintentionally expose error_text + metadata cross-tenant.
--
--   - `cities` write-side: RLS enabled with a SELECT-anon policy and a
--     write-service_role policy — but `anon`/`authenticated` retain
--     INSERT/UPDATE/DELETE/TRUNCATE grants. RLS denies today (verified:
--     anon INSERT returns `42501 row violates RLS`), but this is the same
--     belt-and-suspenders pattern AM-sweep applied to
--     `external_dispatch_attempts`. Adding a write policy here without
--     also gating the grant would leak.
--
-- Fix: explicitly REVOKE the dangerous grants on each table for anon +
-- authenticated. service_role bypasses RLS by design and retains its
-- privileges — production code-paths are unaffected.
--
-- Idempotent: revoke is safe to re-run (no-op if already revoked).

-- ── fm_invites ──────────────────────────────────────────────────────────
revoke insert, update, delete, truncate, references, trigger
  on table public.fm_invites from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.fm_invites from authenticated;
-- SELECT stays granted; the OWNER-read RLS policy is the real gate.
revoke select on table public.fm_invites from anon;
-- authenticated retains SELECT because the policy on it filters per-OWNER.

comment on table public.fm_invites is
  'Internal-only. Owner-issued share-link invites for Fleet Manager tenant_members rows. Token is sent out of band via WhatsApp/Telegram/email; only the SHA-256 hash is stored. RLS + grant lockdown 2026-05-06.';

-- ── function_runs ───────────────────────────────────────────────────────
revoke all on table public.function_runs from anon;
revoke all on table public.function_runs from authenticated;
-- service_role only — same posture as mv_refresh_log.

comment on table public.function_runs is
  'Lane 9 observability — one row per Edge Function invocation. Platform telemetry only. Read via service-role from /dashboard/admin/observability/function-runs. RLS + grant lockdown 2026-05-06.';

-- ── cities (write-side only; SELECT-anon stays public by design) ────────
revoke insert, update, delete, truncate, references, trigger
  on table public.cities from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.cities from authenticated;

comment on table public.cities is
  'Canonical RO cities for tenant scoping and multi-city ops dashboards. Public anon read by design (storefront /orase + onboarding wizard); writes restricted to service_role at both grant and policy layer.';
