-- Migration: courier city binding + fleet/city transfer audit
--
-- Point 1 of the HIR Curier ops roadmap:
--   * "1 account = 1 city": a courier operates in exactly one city at a time,
--     modelled as a single courier_profiles.city_id FK. To work elsewhere a
--     courier must be transferred (their city_id is reassigned).
--   * "transfer a courier to another fleet": moving a courier between fleets
--     (and/or cities) is a platform-admin action, recorded in courier_transfers
--     for a full paper trail.
--
-- city_id is nullable: existing couriers have no city until assigned, and
-- ON DELETE SET NULL keeps a courier row alive if a city is ever removed.

alter table public.courier_profiles
  add column if not exists city_id uuid references public.cities(id) on delete set null;

create index if not exists idx_courier_profiles_city on public.courier_profiles (city_id);

comment on column public.courier_profiles.city_id is
  'The single city this courier operates in (1 account = 1 city). Reassigned '
  'only via a transfer (see courier_transfers). NULL until first assigned.';

-- ── Transfer audit log ───────────────────────────────────────────────────────
create table if not exists public.courier_transfers (
  id              uuid primary key default gen_random_uuid(),
  courier_user_id uuid not null references auth.users(id) on delete cascade,
  from_fleet_id   uuid references public.courier_fleets(id) on delete set null,
  to_fleet_id     uuid not null references public.courier_fleets(id) on delete restrict,
  from_city_id    uuid references public.cities(id) on delete set null,
  to_city_id      uuid references public.cities(id) on delete set null,
  reason          text,
  transferred_by  uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_courier_transfers_courier
  on public.courier_transfers (courier_user_id, created_at desc);

alter table public.courier_transfers enable row level security;

-- The courier can read their own transfer history (so the app can surface
-- "you were moved to <fleet/city> on <date>"). Inserts happen via the service
-- role (platform-admin server action), which bypasses RLS.
create policy "courier_transfers_own_read"
  on public.courier_transfers for select
  using (courier_user_id = auth.uid());

comment on table public.courier_transfers is
  'Audit log of courier fleet/city transfers. Written by the platform-admin '
  'transferCourierAction (service role). One row per move.';
