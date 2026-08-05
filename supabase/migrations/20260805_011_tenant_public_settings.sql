-- v_tenants_storefront strips the fiscal/legal subkeys out of tenants.settings
-- before anon ever sees them. The stripping worked. It was simply not the only
-- way in: `anon` also held column-level SELECT on tenants.settings itself, so
-- the raw blob was one request away.
--
-- Demonstrated against production with the public anon key:
--
--   GET /rest/v1/tenants?select=slug,external_dispatch_secret  -> 401 (good)
--   GET /rest/v1/tenants?select=slug,settings                  -> 200
--        ... {"cui": ...}, {"owner_email_intended": ...}
--
-- One restaurant has fiscal data today. Every restaurant onboarded from here
-- gets cui / reg_com / legal_company / legal_address / legal_postal_code, and
-- all of it would have been public.
--
-- The obvious fix — revoke anon's SELECT on settings — takes the storefront
-- down. The view is `security_invoker=on` (deliberately: it was changed away
-- from a definer view to satisfy the Supabase advisor), so it reads with the
-- caller's privileges and anon needs SELECT on the underlying column.
--
-- So the redacted projection gets a column of its own. anon can read that one
-- and not the raw blob, the view keeps invoker semantics, and no application
-- code changes: the view still publishes the column under the name `settings`,
-- and every server-side reader uses the service-role client on the table.
--
-- Generated rather than trigger-maintained so it cannot drift out of sync.

alter table public.tenants
  add column if not exists public_settings jsonb
  generated always as (
    coalesce(settings, '{}'::jsonb)
      -- fiscal / legal identity
      - 'cui'
      - 'reg_com'
      - 'cod_caen'
      - 'legal_company'
      - 'legal_address'
      - 'legal_postal_code'
      -- internal operations, never storefront content
      - 'email_notifications_enabled'
      - 'onboarding'
      - 'pause_reason'
      - 'owner_email_intended'
      - 'seeded_at'
      - 'seeded_by'
      - 'test_seed'
      - 'source_facebook'
  ) stored;

-- anon reads the redaction, never the source.
revoke select (settings) on public.tenants from anon;
grant select (public_settings) on public.tenants to anon;

-- Same projection as before, same output column name, now sourced from the
-- column anon is actually allowed to read.
create or replace view public.v_tenants_storefront
with (security_invoker = on) as
  select id,
         slug,
         name,
         vertical,
         custom_domain,
         status,
         dispatch_mode,
         domain_status,
         domain_verified_at,
         integration_mode,
         template_slug,
         city_id,
         feature_flags,
         created_at,
         updated_at,
         public_settings as settings
    from public.tenants
   where status = 'ACTIVE'
      or (custom_domain is not null and domain_status = 'ACTIVE');
