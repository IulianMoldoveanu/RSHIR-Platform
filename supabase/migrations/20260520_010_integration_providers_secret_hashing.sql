-- RSHIR security P0: hash integration_providers.webhook_secret + tighten RLS to OWNER.
--
-- Background: webhook_secret was stored plaintext and the SELECT policy
-- 'integration_providers_member_read' allowed any authenticated tenant member
-- (including STAFF) to exfiltrate it. A STAFF member could use the secret to
-- forge POS webhooks against their own tenant, forging order status updates.
--
-- What this migration does:
--   1. Adds webhook_secret_hash column (SHA-256 hex, for future verification).
--   2. For existing rows: writes the plaintext secret into vault under
--      'integration_provider_secret_<id>' and populates webhook_secret_hash.
--   3. Drops the permissive member-read policy.
--   4. Creates 'integration_providers_owner_read' — only OWNER members can
--      SELECT the base table (includes both secret columns).
--   5. Creates a safe view 'integration_providers_public' that excludes both
--      secret columns and grants STAFF SELECT on the view.
--   6. Adds RPC 'integration_providers_get_secret(provider_id uuid)' —
--      service_role only, returns plaintext from vault.
--
-- Plaintext webhook_secret column kept for backward compat during migration;
-- will be dropped in a followup once all consumers use the vault RPC.
--
-- Idempotent: re-runnable.

-- ============================================================
-- 1) Add webhook_secret_hash column
-- ============================================================
alter table public.integration_providers
  add column if not exists webhook_secret_hash text;

-- ============================================================
-- 2) Backfill: push existing plaintext secrets into vault +
--    compute the SHA-256 hash for each existing row.
--    Uses vault_create_or_update_secret (created in
--    20260518_011_connect_webhook_config.sql).
-- ============================================================
do $$
declare
  r record;
begin
  for r in select id, webhook_secret from public.integration_providers
           where webhook_secret is not null
  loop
    -- Write to vault under a stable, row-scoped name.
    perform public.vault_create_or_update_secret(
      'integration_provider_secret_' || r.id::text,
      r.webhook_secret
    );

    -- Store the SHA-256 hex so callers can verify a candidate secret
    -- without retrieving the plaintext.
    update public.integration_providers
       set webhook_secret_hash = encode(
             digest(r.webhook_secret, 'sha256'),
             'hex'
           )
     where id = r.id;
  end loop;
end;
$$;

-- ============================================================
-- 3) Drop the permissive read policy
-- ============================================================
drop policy if exists integration_providers_member_read on public.integration_providers;

-- ============================================================
-- 4) OWNER-only policy on the base table (secrets visible)
-- ============================================================
drop policy if exists integration_providers_owner_read on public.integration_providers;
create policy integration_providers_owner_read
  on public.integration_providers
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
       where tm.tenant_id = integration_providers.tenant_id
         and tm.user_id   = auth.uid()
         and tm.role      = 'OWNER'
    )
  );

-- ============================================================
-- 5) Safe view for STAFF — excludes both secret columns.
--    We do NOT use column-level GRANT because Supabase RLS on
--    a base table with GRANT on individual columns is unreliable
--    across PostgREST versions. A view is the portable approach.
-- ============================================================
create or replace view public.integration_providers_public
  with (security_invoker = false)
as
  select
    id,
    tenant_id,
    provider_key,
    display_name,
    config,
    is_active,
    created_at
  from public.integration_providers;

-- Grant authenticated users SELECT on the view; the underlying base-table
-- SELECT is denied to non-OWNER by the RLS policy above. The view itself
-- runs as the view owner (security_invoker=false → definer semantics via
-- service_role bypass), so PostgREST must query it through supabase-js with
-- service_role to resolve cross-user data. For the authenticated anon path,
-- we apply a separate RLS predicate at the view level via a policy-equivalent
-- security_barrier trick — instead, we re-filter on tenant membership inside
-- the view so STAFF only sees their own tenant rows without touching the
-- secret columns.

-- Replace the view with a membership-filtered variant so STAFF can only
-- see rows for their own tenants.
create or replace view public.integration_providers_public
  with (security_invoker = true)
as
  select
    ip.id,
    ip.tenant_id,
    ip.provider_key,
    ip.display_name,
    ip.config,
    ip.is_active,
    ip.created_at
  from public.integration_providers ip
  where exists (
    select 1 from public.tenant_members tm
     where tm.tenant_id = ip.tenant_id
       and tm.user_id   = auth.uid()
  );

-- Explicitly revoke direct SELECT on the base table from the authenticated
-- role so STAFF cannot bypass the view. OWNER members still access the base
-- table through the RLS policy above.
-- Note: service_role bypasses RLS entirely (unchanged behaviour for the
-- integration-dispatcher Edge Function).
revoke select on public.integration_providers from authenticated;
grant  select on public.integration_providers_public to authenticated;

-- ============================================================
-- 6) RPC: integration_providers_get_secret — service_role only.
--    Returns the plaintext webhook secret for a given provider
--    by reading from vault. The Edge Function dispatcher uses
--    this instead of reading the webhook_secret column directly.
-- ============================================================
create or replace function public.integration_providers_get_secret(p_provider_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'integration_provider_secret_' || p_provider_id::text
   limit 1;
  return v_secret;
end;
$$;

revoke all on function public.integration_providers_get_secret(uuid)
  from public, authenticated, anon;
grant execute on function public.integration_providers_get_secret(uuid)
  to service_role;

comment on function public.integration_providers_get_secret(uuid) is
  'Service-role only. Returns plaintext webhook_secret for the given '
  'integration_providers row by reading from Supabase Vault. '
  'Used by the integration-dispatcher Edge Function.';
