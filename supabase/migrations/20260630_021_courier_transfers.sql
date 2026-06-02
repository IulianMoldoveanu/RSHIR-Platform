-- Migration: courier fleet/city transfer audit
--
-- Point 1 of the HIR Curier ops roadmap: "transfer a courier to another fleet
-- (and/or city)". Moving a courier between fleets/cities is a platform-admin
-- action recorded here for a full paper trail.
--
-- Builds on the EXISTING courier_profiles.city (text, added in
-- 20260630_013_courier_onboarding_fields) — there is intentionally NO new
-- city_id column. "1 account = 1 city" is the single courier_profiles.city
-- value, reassigned only via a transfer. Cities are stored as the city NAME
-- (text), the same value the onboarding flow captures.

create table if not exists public.courier_transfers (
  id              uuid primary key default gen_random_uuid(),
  courier_user_id uuid not null references auth.users(id) on delete cascade,
  from_fleet_id   uuid references public.courier_fleets(id) on delete set null,
  to_fleet_id     uuid not null references public.courier_fleets(id) on delete restrict,
  from_city       text,
  to_city         text,
  reason          text,
  transferred_by  uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_courier_transfers_courier
  on public.courier_transfers (courier_user_id, created_at desc);

alter table public.courier_transfers enable row level security;

-- The courier can read their own transfer history. Inserts happen via the
-- service role (platform-admin server action), which bypasses RLS.
drop policy if exists "courier_transfers_own_read" on public.courier_transfers;
create policy "courier_transfers_own_read"
  on public.courier_transfers for select
  using (courier_user_id = auth.uid());

comment on table public.courier_transfers is
  'Audit log of courier fleet/city transfers. Written by the platform-admin '
  'transferCourierAction (service role). One row per move. City is the '
  'courier_profiles.city text name (no cities FK).';
