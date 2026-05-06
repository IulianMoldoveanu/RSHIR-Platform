-- Lane MULTI-CITY: canonical `cities` reference table + tenant FK.
--
-- Today city is free-text in `tenants.settings.city` (e.g. "Brașov",
-- "brasov", "Brasov" all coexist). That breaks city-scoped filters in
-- /dashboard/admin/tenants and /dashboard/admin/fleet-managers and
-- blocks the multi-city ops dashboards Iulian needs for the București
-- affiliate tour.
--
-- This migration is ADDITIVE only:
--   1. New `cities` table with the 12 canonical RO cities Iulian sells in
--      (București + Brașov + 10 next tiers). Sort order = dropdown order.
--   2. New nullable `tenants.city_id` FK. NULL = legacy/unmigrated; the
--      onboarding wizard + admin "Setează oraș" inline action let Iulian
--      claim a city per tenant when convenient. NO automated backfill of
--      free-text `settings.city` — risky on FOISORUL A LIVE prod and
--      easily wrong (diacritic + casing chaos).
--
-- Existing readers of `tenants.settings.city` keep working unchanged.
-- New code prefers `cities.name` joined via `city_id` and falls back to
-- the free-text value when `city_id IS NULL`.

-- ── 1. cities reference table ───────────────────────────────────────────
create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  county text,
  country_code text not null default 'RO',
  timezone text not null default 'Europe/Bucharest',
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists cities_active_sort_idx
  on public.cities (is_active, sort_order);

create index if not exists cities_slug_idx
  on public.cities (slug);

comment on table public.cities is
  'Canonical RO cities for tenant scoping and multi-city ops dashboards. Read by all authenticated users; writes restricted to service_role (platform-admin tooling).';

comment on column public.cities.sort_order is
  'Ascending integer controlling order in onboarding + admin dropdowns. Lower = earlier. Use 100+ for tier-3 cities so Iulian can reorder without renumbering.';

-- ── 2. Seed the 12 launch cities ────────────────────────────────────────
-- INSERT … ON CONFLICT DO NOTHING keeps the migration idempotent: re-running
-- it never duplicates and never overwrites a row Iulian edited from the
-- admin UI.
insert into public.cities (name, slug, county, sort_order) values
  ('București',     'bucuresti',   'București',  1),
  ('Brașov',        'brasov',      'Brașov',     2),
  ('Cluj-Napoca',   'cluj-napoca', 'Cluj',       3),
  ('Timișoara',     'timisoara',   'Timiș',      4),
  ('Iași',          'iasi',        'Iași',       5),
  ('Constanța',     'constanta',   'Constanța',  6),
  ('Sibiu',         'sibiu',       'Sibiu',      7),
  ('Oradea',        'oradea',      'Bihor',      8),
  ('Galați',        'galati',      'Galați',     9),
  ('Ploiești',      'ploiesti',    'Prahova',   10),
  ('Craiova',       'craiova',     'Dolj',      11),
  ('Arad',          'arad',        'Arad',      12)
on conflict (slug) do nothing;

-- ── 3. RLS: read = anyone authenticated, write = service_role only ──────
alter table public.cities enable row level security;

drop policy if exists "authenticated_select_cities" on public.cities;
create policy "authenticated_select_cities"
  on public.cities
  for select
  to anon, authenticated
  using (true);

drop policy if exists "service_role_write_cities" on public.cities;
create policy "service_role_write_cities"
  on public.cities
  for all
  to service_role
  using (true)
  with check (true);

-- ── 4. tenants.city_id FK (nullable, on delete set null) ────────────────
alter table public.tenants
  add column if not exists city_id uuid references public.cities(id) on delete set null;

create index if not exists tenants_city_id_idx
  on public.tenants (city_id);

comment on column public.tenants.city_id is
  'Canonical city FK. NULL = legacy tenant whose city is still in settings.city free-text. Set via onboarding wizard or platform-admin "Setează oraș" inline action. Never required.';
