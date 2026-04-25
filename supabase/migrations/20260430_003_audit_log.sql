-- HIR Restaurant Suite - RSHIR-45 Per-tenant audit log
-- Tracks state-changing admin actions so OWNERs can see who did what.
-- Idempotent: safe to re-apply.

-- ============================================================
-- TABLE
-- ============================================================
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_tenant_id_created_at_idx
  on public.audit_log (tenant_id, created_at desc);

-- ============================================================
-- RLS
-- ============================================================
-- Tenant members may read their tenant's audit log. Writes only happen
-- through the service-role client from server actions, which bypasses
-- RLS entirely — so we do NOT add an INSERT policy.
alter table public.audit_log enable row level security;

drop policy if exists audit_log_tenant_member_read on public.audit_log;
create policy audit_log_tenant_member_read
  on public.audit_log
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = audit_log.tenant_id
        and tm.user_id  = auth.uid()
    )
  );
