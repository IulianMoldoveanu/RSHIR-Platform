-- Lane EVENTS-SIGNAL-INGESTION (2026-05-08): per-city events / festivaluri /
-- concerte ingestion. Pairs with weather_snapshots (20260508_001) so AI
-- agents can recommend context-aware promos ("concert pe stadion la 20:00,
-- creșteți capacitatea curierilor").
--
-- ADDITIVE-ONLY:
--   1. New `city_events` table — one row per (city × source × source_event_id).
--      Indexed for "upcoming events per city" + dedupe via composite unique.
--   2. New pg_cron job `events-snapshot-fetch` runs once daily at 04:07 UTC
--      (low traffic). Three sources today: Eventbrite Public Events API,
--      TicketMaster Discovery API, Google Places (text search). Manual feed
--      also supported (source='manual', no API call needed).
--   3. 90-day retention prune at :19 hourly. Past events are kept the same
--      90d so post-event analysis is still possible.
--
-- All three external sources have a free tier with no credit card required:
--   - Eventbrite:   `eventbrite_api_token`     (40 req/h)
--   - TicketMaster: `ticketmaster_api_key`     (5k req/day)
--   - Google Places:`google_places_api_key`    (free $200/mo credit, ~17k Text Searches)
-- Until each is provisioned, the corresponding fetch path returns
-- `API_KEY_MISSING_<SRC>` and the others continue to work independently.

-- ============================================================
-- 1. city_events table
-- ============================================================
create table if not exists public.city_events (
  id                   uuid primary key default gen_random_uuid(),
  city_id              uuid not null references public.cities(id) on delete cascade,
  -- Event metadata.
  event_name           text not null,
  event_type           text not null check (event_type in (
                          'concert','festival','sport','conference',
                          'theatre','exhibition','holiday','other'
                       )),
  start_at             timestamptz not null,
  end_at               timestamptz,
  venue_name           text,
  venue_lat            double precision,
  venue_lon            double precision,
  expected_attendance  int check (expected_attendance is null or expected_attendance >= 0),
  url                  text,
  -- Provenance + dedupe.
  source               text not null check (source in (
                          'eventbrite','ticketmaster','google_places','manual'
                       )),
  source_event_id      text not null,
  raw_payload          jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Composite uniqueness so the same upstream event can't double-insert when
-- the cron runs twice in the same day (or two sources collide). Manual rows
-- get a synthetic `source_event_id` (uuid) on insert.
create unique index if not exists city_events_source_dedupe_uq
  on public.city_events (source, source_event_id);

-- "Upcoming events per city" — the main read pattern (admin tile + Hepy +
-- AI suggestion helper).
create index if not exists city_events_city_start_idx
  on public.city_events (city_id, start_at);

create index if not exists city_events_start_at_idx
  on public.city_events (start_at);

comment on table public.city_events is
  'Per-city upcoming events ingested daily from Eventbrite + TicketMaster + Google Places + manual feed. Read by admin dashboard tile, Hepy /evenimente intent, and event-correlated marketing suggestions. 90-day retention pruned hourly.';

comment on column public.city_events.source is
  'Origin of the event row. ''manual'' = entered via /dashboard/admin/cities/events form or CSV import.';

comment on column public.city_events.expected_attendance is
  'Best-effort attendance estimate. NULL when upstream does not provide one. Used only as a confidence signal for marketing rules — never as authoritative input.';

-- updated_at trigger (kept narrow; fires only on UPDATE).
create or replace function public.city_events_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists city_events_set_updated_at_trg on public.city_events;
create trigger city_events_set_updated_at_trg
  before update on public.city_events
  for each row execute function public.city_events_set_updated_at();

-- ============================================================
-- 2. RLS — read = anyone authenticated + anon (events are public),
--           write = service_role only (Edge Function + admin server actions
--           use service key).
-- ============================================================
alter table public.city_events enable row level security;

drop policy if exists "anon_authenticated_select_city_events" on public.city_events;
create policy "anon_authenticated_select_city_events"
  on public.city_events
  for select
  to anon, authenticated
  using (true);

drop policy if exists "service_role_write_city_events" on public.city_events;
create policy "service_role_write_city_events"
  on public.city_events
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================
-- 3. pg_cron — fetch once daily at 04:07 UTC + prune > 90d hourly
-- ============================================================
-- Operator setup (run ONCE separately to seed URL + cron token):
--   select public.hir_write_vault_secret(
--     'events_snapshot_url',
--     'https://qfmeojeipncuxeltnvab.functions.supabase.co/events-snapshot',
--     'events-snapshot Edge Function URL');
--   select public.hir_write_vault_secret(
--     'events_cron_token',
--     '<random-32-byte-hex>',
--     'shared secret for X-Cron-Token between pg_cron and events-snapshot fn');
--
-- Per-source API keys live separately and are read by the Edge Function:
--   eventbrite_api_token      (sign up free, 40 req/h)
--   ticketmaster_api_key      (sign up free, 5k req/day)
--   google_places_api_key     (sign up free $200 credit)
-- Until each is written, that source path returns API_KEY_MISSING_<SRC>
-- and the cron job logs SUCCESS with the missing-key list in metadata.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare existing_jobid bigint;
begin
  select jobid into existing_jobid from cron.job where jobname = 'events-snapshot-fetch';
  if existing_jobid is not null then perform cron.unschedule(existing_jobid); end if;
end $$;

select cron.schedule(
  'events-snapshot-fetch',
  -- 04:07 UTC daily (== 06:07/07:07 Europe/Bucharest depending on DST).
  -- Avoids contention with smartbill */5, growth-agent 55 5, and the
  -- weather-snapshot 7 */6 cadence.
  '7 4 * * *',
  $$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets
                  where name = 'events_snapshot_url' limit 1),
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || coalesce(
          (select decrypted_secret from vault.decrypted_secrets
            where name = 'notify_function_anon_jwt' limit 1),
          ''
        ),
        'X-Cron-Token',  coalesce(
          (select decrypted_secret from vault.decrypted_secrets
            where name = 'events_cron_token' limit 1),
          ''
        )
      ),
      body    := jsonb_build_object('mode','fetch')
    );
  $$
);

-- 90-day retention prune. Runs hourly at :19 (offset from weather's :17).
do $$
declare existing_jobid bigint;
begin
  select jobid into existing_jobid from cron.job where jobname = 'city-events-prune';
  if existing_jobid is not null then perform cron.unschedule(existing_jobid); end if;
end $$;

select cron.schedule(
  'city-events-prune',
  '19 * * * *',
  $$ delete from public.city_events
     where coalesce(end_at, start_at) < now() - interval '90 days'; $$
);
