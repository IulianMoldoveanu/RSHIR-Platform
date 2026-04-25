-- HIR Restaurant Suite - Sprint 3 / RSHIR-12
-- Custom domain support: per-tenant FQDN + Vercel attach lifecycle.
-- Idempotent (uses IF NOT EXISTS / drop-and-recreate for policies).

-- ============================================================
-- Schema additions on tenants
-- ============================================================
alter table public.tenants
  add column if not exists domain_status text not null default 'NONE'
    check (domain_status in ('NONE','PENDING_DNS','PENDING_SSL','ACTIVE','FAILED'));

alter table public.tenants
  add column if not exists domain_verified_at timestamptz;

create index if not exists idx_tenants_custom_domain_active
  on public.tenants(custom_domain)
  where domain_status = 'ACTIVE';

-- ============================================================
-- Helper: is auth.uid() an OWNER of <tenant_id>?
-- Used by the admin actions/routes; RLS still relies on is_tenant_member
-- for table-wide visibility, but domain mutations check OWNER server-side.
-- ============================================================
create or replace function public.is_tenant_owner(t_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_members
    where tenant_id = t_id
      and user_id = auth.uid()
      and role = 'OWNER'
  );
$$;

-- ============================================================
-- Tighten anon read on tenants:
-- The storefront resolver needs (a) slug-based lookup for *.hir.ro/*.lvh.me
-- subdomains and (b) custom_domain lookup for ACTIVE custom domains. Drop the
-- blanket `using (true)` and restrict to ACTIVE tenants OR rows still in
-- ONBOARDING (subdomain still works for unfinished tenants in dev).
-- ============================================================
drop policy if exists "tenants_anon_select" on public.tenants;
create policy "tenants_anon_select"
  on public.tenants for select
  to anon
  using (
    status = 'ACTIVE'
    or (custom_domain is not null and domain_status = 'ACTIVE')
    or status = 'ONBOARDING'
  );

-- ============================================================
-- Restrict UPDATE on tenants to OWNERs (prior policy allowed any member).
-- ============================================================
drop policy if exists "tenants_member_update" on public.tenants;
create policy "tenants_owner_update"
  on public.tenants for update
  to authenticated
  using (public.is_tenant_owner(id))
  with check (public.is_tenant_owner(id));
