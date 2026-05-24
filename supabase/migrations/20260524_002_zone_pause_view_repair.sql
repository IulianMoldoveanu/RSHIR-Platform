-- Repair for 20260524_001_zone_pause.sql.
--
-- The view tenant_zone_active_pauses tried to SELECT z.localities + z.city_id
-- assuming the city-owned pricing_zones shape — but on prod, the LEGACY
-- per-tenant delivery_zones (from 20260425_000_initial.sql) is the table
-- referenced by FK and that table has neither column.
--
-- The original migration was rejected by Supabase Mgmt API with 42703 on
-- z.localities. This re-runs the table create as a no-op (IF NOT EXISTS)
-- and replaces the view with the correct projection.

-- ── 1. tenant_zone_pauses ────────────────────────────────────────────────────
-- Re-issued so this migration is self-contained for any environment where
-- 20260524_001 only partially landed.

create table if not exists public.tenant_zone_pauses (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references public.tenants(id) on delete cascade,
  zone_id      uuid        not null references public.delivery_zones(id) on delete restrict,
  reason       text        not null,
  paused_until timestamptz,
  paused_by    uuid        not null references auth.users(id) on delete restrict,
  paused_via   text        not null check (paused_via in ('CONTROL_ROOM', 'HEPY', 'ADMIN')),
  paused_at    timestamptz not null default now(),
  resumed_at   timestamptz,
  resumed_by   uuid        references auth.users(id) on delete restrict,
  resumed_via  text        check (resumed_via in ('CONTROL_ROOM', 'HEPY', 'ADMIN', 'AUTO_EXPIRE')),
  notes        text,

  constraint tenant_zone_pauses_resume_consistent
    check (
      (resumed_at is null and resumed_by is null and resumed_via is null)
      or (resumed_at is not null and resumed_by is not null and resumed_via is not null)
    ),
  constraint tenant_zone_pauses_resume_after_pause
    check (resumed_at is null or resumed_at >= paused_at)
);

create unique index if not exists idx_tenant_zone_pauses_active
  on public.tenant_zone_pauses (tenant_id, zone_id)
  where resumed_at is null;

create index if not exists idx_tenant_zone_pauses_tenant_recent
  on public.tenant_zone_pauses (tenant_id, paused_at desc);

create index if not exists idx_tenant_zone_pauses_zone_recent
  on public.tenant_zone_pauses (zone_id, paused_at desc);


-- ── 2. View: currently active pauses (FIXED projection) ──────────────────────
-- LEGACY delivery_zones has: id, tenant_id, name, polygon, is_active,
-- sort_order, created_at. No localities, no city_id. Restrict the view to
-- columns that actually exist.

drop view if exists public.tenant_zone_active_pauses;

create or replace view public.tenant_zone_active_pauses as
select
  p.id,
  p.tenant_id,
  p.zone_id,
  p.reason,
  p.paused_until,
  p.paused_by,
  p.paused_via,
  p.paused_at,
  p.notes,
  z.name        as zone_name,
  z.is_active   as zone_is_active
from public.tenant_zone_pauses p
join public.delivery_zones z on z.id = p.zone_id
where p.resumed_at is null
  and (p.paused_until is null or p.paused_until > now());


-- ── 3. RPC: is_tenant_zone_paused ────────────────────────────────────────────
-- Re-issued so this single migration brings the RPC into a fresh DB.

create or replace function public.is_tenant_zone_paused(
  p_tenant_id uuid,
  p_zone_id   uuid
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (
      select 1 from public.tenant_zone_active_pauses
       where tenant_id = p_tenant_id and zone_id = p_zone_id
    ) then null
    else (
      select jsonb_build_object(
        'paused', true,
        'reason', reason,
        'paused_until', paused_until,
        'paused_at', paused_at
      )
      from public.tenant_zone_active_pauses
      where tenant_id = p_tenant_id and zone_id = p_zone_id
      limit 1
    )
  end;
$$;

revoke all on function public.is_tenant_zone_paused(uuid, uuid) from public;
grant execute on function public.is_tenant_zone_paused(uuid, uuid) to anon, authenticated, service_role;


-- ── 4. RLS ───────────────────────────────────────────────────────────────────

alter table public.tenant_zone_pauses enable row level security;

drop policy if exists "tenant_zone_pauses_tenant_select" on public.tenant_zone_pauses;
create policy "tenant_zone_pauses_tenant_select"
  on public.tenant_zone_pauses for select
  to authenticated
  using (
    tenant_id in (
      select tenant_id from public.tenant_members where user_id = auth.uid()
    )
  );

drop policy if exists "tenant_zone_pauses_tenant_insert" on public.tenant_zone_pauses;
create policy "tenant_zone_pauses_tenant_insert"
  on public.tenant_zone_pauses for insert
  to authenticated
  with check (
    paused_by = auth.uid()
    and tenant_id in (
      select tenant_id from public.tenant_members where user_id = auth.uid()
    )
  );

drop policy if exists "tenant_zone_pauses_tenant_resume" on public.tenant_zone_pauses;
create policy "tenant_zone_pauses_tenant_resume"
  on public.tenant_zone_pauses for update
  to authenticated
  using (
    tenant_id in (
      select tenant_id from public.tenant_members where user_id = auth.uid()
    )
  )
  with check (
    tenant_id in (
      select tenant_id from public.tenant_members where user_id = auth.uid()
    )
  );

drop policy if exists "tenant_zone_pauses_service_role_all" on public.tenant_zone_pauses;
create policy "tenant_zone_pauses_service_role_all"
  on public.tenant_zone_pauses for all
  to service_role
  using (true)
  with check (true);

grant select on public.tenant_zone_active_pauses to anon, authenticated, service_role;
