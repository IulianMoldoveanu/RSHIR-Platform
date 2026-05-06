-- Lane AGGREGATOR-EMAIL-INTAKE — security hardening on PR #306.
--
-- Codex P1 review (2026-05-06): the broad SELECT policy on
-- public.aggregator_intake_aliases lets any tenant member read every
-- column of their own row, INCLUDING the `secret` token. That token is
-- the per-tenant credential used by the Cloudflare Email Worker when
-- POSTing to the aggregator-email-parser Edge Function. Exposing it to
-- every staff browser means a tenant member or compromised authenticated
-- session can spoof inbound aggregator emails with just (alias_local,
-- secret). The token must stay service-role only.
--
-- Why a naive `REVOKE SELECT (secret)` was insufficient:
--   Supabase auto-grants table-level SELECT to `authenticated` when a
--   public-schema table is created. A table-level grant implicitly
--   covers every column, so a column-level REVOKE is shadowed.
--
-- Fix:
--   1. Revoke table-level SELECT from authenticated, dropping the
--      implicit column coverage.
--   2. Grant column-level SELECT on the safe columns (tenant_id,
--      alias_local, enabled, created_at) so the existing RLS policy +
--      settings page still work.
--   3. service_role bypasses RLS by design and retains full access.
--
-- Idempotent. Re-running is a no-op.

revoke select on table public.aggregator_intake_aliases from authenticated;

grant select (tenant_id, alias_local, enabled, created_at)
  on public.aggregator_intake_aliases to authenticated;

-- Defense in depth: explicit revoke on `secret` for both roles. Even
-- though step 1 already strips authenticated's coverage and migration
-- 013 revoked all from anon, this makes the intent unambiguous to any
-- future audit or schema diff.
revoke select (secret) on public.aggregator_intake_aliases from authenticated;
revoke select (secret) on public.aggregator_intake_aliases from anon;

comment on column public.aggregator_intake_aliases.secret is
  'Per-tenant token embedded in the Cloudflare Email Worker forward URL. '
  'service_role only — column-level SELECT revoked from anon + authenticated '
  '(see migration 20260506_014). Never expose to client code.';
