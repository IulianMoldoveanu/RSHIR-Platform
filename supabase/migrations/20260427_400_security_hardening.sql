-- HIR Restaurant Suite - RSHIR-16 Sprint 3 hardening pass
-- H3: Drop the `or status = 'ONBOARDING'` clause from tenants_anon_select.
-- The previous migration (20260426_300) widened anon read to include onboarding
-- tenants for dev convenience, but that exposes every in-progress tenant's
-- name, slug, custom_domain, and settings to unauthenticated callers via the
-- public REST surface. ACTIVE-only is the correct gate.
--
-- Idempotent: drops the existing policy and recreates with the tightened scope.

drop policy if exists "tenants_anon_select" on public.tenants;
create policy "tenants_anon_select"
  on public.tenants for select
  to anon
  using (
    status = 'ACTIVE'
    or (custom_domain is not null and domain_status = 'ACTIVE')
  );
