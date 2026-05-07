-- Lane WEATHER-SIGNAL-INGESTION (2026-05-08): daily-refresh weather snapshot
-- per active city. Surfaced to admin tile + Hepy `/vreme` intent. Future
-- Marketing agent reads this table to suggest weather-correlated promos
-- ("Plouă mâine în Brașov, recomandăm supe + ciorbe").
--
-- ADDITIVE-ONLY:
--   1. Extends `cities` with nullable `lat`/`lon` columns and backfills
--      the 13 launch cities with rough city-hall centroids (reused from
--      `apps/restaurant-admin/src/app/dashboard/zones/default-city-centers.ts`).
--      Existing readers don't care; new code is the only consumer.
--   2. New `weather_snapshots` table — one row per (city × fetch). Indexed
--      for "latest snapshot per city". Retention is 30 days, pruned
--      hourly via the same pg_cron extension already used by SmartBill
--      and growth-agent.
--   3. New pg_cron job that pings the `weather-snapshot` Edge Function
--      every 6h (4 calls × 13 cities/day = 52 calls — well inside the
--      OpenWeatherMap free tier of 1k calls/day, 60 calls/min). The fn
--      itself returns `API_KEY_MISSING` until Iulian writes the vault
--      secret `openweathermap_api_key`, so the migration is safe to ship
--      before the operator step.
--
-- Schema mirrors the proven SmartBill pattern: vault-stored URL + bearer +
-- shared secret guard, cron pings the public function URL with the bearer
-- gateway header + the shared-secret app header.

-- ============================================================
-- 1. cities.lat / cities.lon backfill
-- ============================================================
alter table public.cities
  add column if not exists lat double precision,
  add column if not exists lon double precision;

comment on column public.cities.lat is
  'Rough city-hall centroid latitude. Used by weather ingestion + zones empty-state. NULL = unknown / unset; weather fn skips. Source: same table as default-city-centers.ts.';

comment on column public.cities.lon is
  'Rough city-hall centroid longitude. See `lat` comment for source.';

-- Backfill the 13 launch cities. UPDATE only when lat IS NULL so an
-- operator who hand-edited the row from admin tooling is never overwritten.
update public.cities set lat = 44.4268, lon = 26.1025 where slug = 'bucuresti'   and lat is null;
update public.cities set lat = 45.6579, lon = 25.6012 where slug = 'brasov'      and lat is null;
update public.cities set lat = 46.7712, lon = 23.6236 where slug = 'cluj-napoca' and lat is null;
update public.cities set lat = 45.7489, lon = 21.2087 where slug = 'timisoara'   and lat is null;
update public.cities set lat = 47.1585, lon = 27.6014 where slug = 'iasi'        and lat is null;
update public.cities set lat = 44.1733, lon = 28.6383 where slug = 'constanta'   and lat is null;
update public.cities set lat = 45.7983, lon = 24.1255 where slug = 'sibiu'       and lat is null;
update public.cities set lat = 47.0722, lon = 21.9211 where slug = 'oradea'      and lat is null;
update public.cities set lat = 45.4353, lon = 28.0080 where slug = 'galati'      and lat is null;
update public.cities set lat = 44.9466, lon = 26.0303 where slug = 'ploiesti'    and lat is null;
update public.cities set lat = 44.3302, lon = 23.7949 where slug = 'craiova'     and lat is null;
update public.cities set lat = 46.1866, lon = 21.3123 where slug = 'arad'        and lat is null;

-- ============================================================
-- 2. weather_snapshots table
-- ============================================================
create table if not exists public.weather_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  city_id               uuid not null references public.cities(id) on delete cascade,
  snapshot_at           timestamptz not null default now(),
  -- Core fields. Nullable on purpose — if upstream returns a partial
  -- payload, we still record the row so the timeline is unbroken; the
  -- consumer code falls back to the latest non-null per field.
  temp_c                numeric(5,2),
  feels_like_c          numeric(5,2),
  weather_code          int,         -- OpenWeatherMap "id" (200-804)
  weather_main          text,        -- e.g. "Rain", "Clear", "Snow"
  weather_desc          text,        -- e.g. "ploaie torențială"
  humidity_pct          int check (humidity_pct is null or (humidity_pct between 0 and 100)),
  wind_speed_ms         numeric(5,2),
  precipitation_1h_mm   numeric(6,2),
  raw_payload           jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists weather_snapshots_city_recent_idx
  on public.weather_snapshots (city_id, snapshot_at desc);

create index if not exists weather_snapshots_snapshot_at_idx
  on public.weather_snapshots (snapshot_at desc);

comment on table public.weather_snapshots is
  'Hourly-ish OpenWeatherMap snapshots per active city. Read by admin dashboard tile, Hepy /vreme intent, and weather-correlated marketing suggestions. 30-day retention pruned hourly via pg_cron.';

comment on column public.weather_snapshots.weather_code is
  'OpenWeatherMap weather id (e.g. 500 = light rain, 800 = clear). See https://openweathermap.org/weather-conditions.';

-- ============================================================
-- 3. RLS — read = anyone authenticated + anon (city weather is public),
--           write = service_role only (Edge Function uses service key).
-- ============================================================
alter table public.weather_snapshots enable row level security;

drop policy if exists "anon_authenticated_select_weather" on public.weather_snapshots;
create policy "anon_authenticated_select_weather"
  on public.weather_snapshots
  for select
  to anon, authenticated
  using (true);

drop policy if exists "service_role_write_weather" on public.weather_snapshots;
create policy "service_role_write_weather"
  on public.weather_snapshots
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================
-- 4. pg_cron — fetch every 6h + prune > 30d hourly
-- ============================================================
-- Operator setup (run ONCE separately to seed URL + bearer + secret):
--   select public.hir_write_vault_secret(
--     'weather_snapshot_url',
--     'https://qfmeojeipncuxeltnvab.functions.supabase.co/weather-snapshot',
--     'weather-snapshot Edge Function URL');
--   select public.hir_write_vault_secret(
--     'weather_cron_token',
--     '<random-32-byte-hex>',
--     'shared secret for X-Cron-Token between pg_cron and weather-snapshot fn');
--
-- The bearer reuses `notify_function_anon_jwt` (same pattern as SmartBill)
-- — that bearer is gateway plumbing only; the real auth gate is the
-- shared-secret X-Cron-Token header.
--
-- API key (`openweathermap_api_key`) is read by the Edge Function itself
-- via vault, NOT by pg_cron. Until Iulian writes it, the fn returns
-- `API_KEY_MISSING` and the cron job logs SUCCESS with that metadata.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent unschedule before re-schedule (matches smartbill / growth-agent).
do $$
declare existing_jobid bigint;
begin
  select jobid into existing_jobid from cron.job where jobname = 'weather-snapshot-fetch';
  if existing_jobid is not null then perform cron.unschedule(existing_jobid); end if;
end $$;

select cron.schedule(
  'weather-snapshot-fetch',
  -- 6h cadence at offset 7 minutes past the hour (avoids contention
  -- with smartbill */5 and growth-agent 55 5).
  '7 */6 * * *',
  $$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets
                  where name = 'weather_snapshot_url' limit 1),
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || coalesce(
          (select decrypted_secret from vault.decrypted_secrets
            where name = 'notify_function_anon_jwt' limit 1),
          ''
        ),
        'X-Cron-Token',  coalesce(
          (select decrypted_secret from vault.decrypted_secrets
            where name = 'weather_cron_token' limit 1),
          ''
        )
      ),
      body    := jsonb_build_object('mode','fetch')
    );
  $$
);

-- 30-day retention prune. Runs hourly at :17. Keeps the table small
-- (52 fetches/day × 30 days × 13 cities ≈ 20k rows steady state).
do $$
declare existing_jobid bigint;
begin
  select jobid into existing_jobid from cron.job where jobname = 'weather-snapshot-prune';
  if existing_jobid is not null then perform cron.unschedule(existing_jobid); end if;
end $$;

select cron.schedule(
  'weather-snapshot-prune',
  '17 * * * *',
  $$ delete from public.weather_snapshots where snapshot_at < now() - interval '30 days'; $$
);
