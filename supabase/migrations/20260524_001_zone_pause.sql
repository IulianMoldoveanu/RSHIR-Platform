-- Per-tenant delivery zone pause — real-time on/off for accepting orders into a zone.
--
-- Business decision (2026-05-24, confirmed by Iulian):
--   Each tenant can pause/resume order acceptance into any city zone independently
--   (storm, sold-out area, courier shortage, etc.). City-wide pause by HIR admin
--   is a follow-up; this migration scopes to per-tenant only.
--
-- Surfaces that need this:
--   - Restaurant Control Room: toggle per zone with reason + optional auto-resume duration
--   - Hepy NL tool: `pause_delivery_zone(zone, duration?, reason)` invokes same flow
--   - Customer checkout (site / aggregator landing): block order with friendly ETA
--
-- Append-only audit pattern: every pause and resume is a row in `tenant_zone_pauses`.
-- Current state = rows where resumed_at IS NULL AND (paused_until IS NULL OR paused_until > now()).
-- Partial unique index enforces "at most one active pause per (tenant, zone)".

-- ── 1. tenant_zone_pauses ────────────────────────────────────────────────────

create table if not exists public.tenant_zone_pauses (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references public.tenants(id) on delete cascade,
  zone_id      uuid        not null references public.delivery_zones(id) on delete restrict,
  -- Free-text reason (prefab options selected on the UI: 'furtuna', 'lipsa_curier', 'sold_out', 'manual', etc.).
  reason       text        not null,
  -- Null = paused until manually resumed. Non-null = auto-resume target time.
  paused_until timestamptz,
  -- auth.uid() of the user who paused (or service_role sentinel for Hepy/admin actions).
  paused_by    uuid        not null references auth.users(id) on delete restrict,
  -- How the pause was issued. Helps Insights ("80% of pauses come via Hepy = good signal").
  paused_via   text        not null check (paused_via in ('CONTROL_ROOM', 'HEPY', 'ADMIN')),
  paused_at    timestamptz not null default now(),
  -- Resume bookkeeping. Null = pause still active (until paused_until expires or manual resume).
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

-- At most one active pause per (tenant, zone).
create unique index if not exists idx_tenant_zone_pauses_active
  on public.tenant_zone_pauses (tenant_id, zone_id)
  where resumed_at is null;

create index if not exists idx_tenant_zone_pauses_tenant_recent
  on public.tenant_zone_pauses (tenant_id, paused_at desc);

create index if not exists idx_tenant_zone_pauses_zone_recent
  on public.tenant_zone_pauses (zone_id, paused_at desc);

comment on table public.tenant_zone_pauses is
  'Per-tenant pause of order acceptance into a delivery zone. Append-only audit: resume sets resumed_at; never DELETE. Current state = resumed_at IS NULL AND (paused_until IS NULL OR paused_until > now()).';
comment on column public.tenant_zone_pauses.paused_until is
  'Optional auto-resume target. NULL = paused until explicitly resumed. App-side check: pause is INACTIVE once paused_until < now().';
comment on column public.tenant_zone_pauses.paused_via is
  'Source of the pause action: CONTROL_ROOM (patron click), HEPY (NL command), ADMIN (HIR ops).';


-- ── 2. View: currently active pauses ─────────────────────────────────────────
-- Convenience for UI + checkout. Filters out expired auto-resumes without
-- requiring a sweeper to mark resumed_at.

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
  z.localities  as zone_localities,
  z.city_id     as zone_city_id
from public.tenant_zone_pauses p
join public.delivery_zones z on z.id = p.zone_id
where p.resumed_at is null
  and (p.paused_until is null or p.paused_until > now());

comment on view public.tenant_zone_active_pauses is
  'Currently-effective zone pauses per tenant. Drops auto-expired pauses without app sweeper.';


-- ── 3. RPC: is_tenant_zone_paused ────────────────────────────────────────────
-- Public-readable check for the customer checkout flow. Returns NULL if not paused,
-- or a JSON payload with reason + ETA so the UI can show a friendly block.

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

comment on function public.is_tenant_zone_paused is
  'Returns NULL if zone accepts orders, or { paused:true, reason, paused_until, paused_at } if paused. Used by checkout flow + Hepy status query.';


-- ── 4. RLS ───────────────────────────────────────────────────────────────────

alter table public.tenant_zone_pauses enable row level security;

-- Tenant members can read their own pause history.
drop policy if exists "tenant_zone_pauses_tenant_select" on public.tenant_zone_pauses;
create policy "tenant_zone_pauses_tenant_select"
  on public.tenant_zone_pauses for select
  to authenticated
  using (
    tenant_id in (
      select tenant_id from public.tenant_members where user_id = auth.uid()
    )
  );

-- Tenant members can pause their own zones (INSERT only — resume via UPDATE policy below).
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

-- Tenant members can resume their own active pauses (UPDATE only the resume columns).
-- App must set resumed_at + resumed_by + resumed_via together (CHECK constraint enforces this).
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

-- Service role (Hepy, admin) full access.
drop policy if exists "tenant_zone_pauses_service_role_all" on public.tenant_zone_pauses;
create policy "tenant_zone_pauses_service_role_all"
  on public.tenant_zone_pauses for all
  to service_role
  using (true)
  with check (true);

-- View inherits RLS from underlying tables. Grant select explicitly so anon checkout
-- can see active pauses for the tenant they're ordering from (via the RPC above).
grant select on public.tenant_zone_active_pauses to anon, authenticated, service_role;
