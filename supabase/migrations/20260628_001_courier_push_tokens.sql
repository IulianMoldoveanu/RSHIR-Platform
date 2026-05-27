-- Migration: courier_push_tokens
-- Stores native FCM (Android) and APNs (iOS) device tokens for courier push.
-- The Edge Function courier-push-register upserts here on every app launch.
-- The Edge Function notify-courier-new-order reads from here to dispatch FCM/APNs.

create table if not exists public.courier_push_tokens (
  id             uuid primary key default gen_random_uuid(),
  courier_id     uuid not null references public.courier_profiles(id) on delete cascade,
  fcm_token      text not null,
  platform       text not null check (platform in ('android', 'ios', 'web')),
  last_seen_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),

  -- One active token per courier per platform. On re-registration (app reinstall,
  -- token rotation) the token value is updated in-place.
  constraint courier_push_tokens_courier_platform_uq unique (courier_id, platform)
);

-- Index for the dispatch query: find all tokens for a given courier.
create index if not exists courier_push_tokens_courier_id_idx
  on public.courier_push_tokens (courier_id);

-- RLS: couriers can only read/write their own tokens.
alter table public.courier_push_tokens enable row level security;

create policy "courier_push_tokens_own_read"
  on public.courier_push_tokens for select
  using (
    courier_id in (
      select id from public.courier_profiles where user_id = auth.uid()
    )
  );

create policy "courier_push_tokens_own_upsert"
  on public.courier_push_tokens for insert
  with check (
    courier_id in (
      select id from public.courier_profiles where user_id = auth.uid()
    )
  );

create policy "courier_push_tokens_own_update"
  on public.courier_push_tokens for update
  using (
    courier_id in (
      select id from public.courier_profiles where user_id = auth.uid()
    )
  );

-- Service role (Edge Functions) can read all tokens for dispatch.
-- No policy needed for service role — it bypasses RLS by default.

comment on table public.courier_push_tokens is
  'Native FCM/APNs device tokens for courier push notifications. '
  'Upserted by the courier-push-register Edge Function on every app launch. '
  'Read by notify-courier-new-order to dispatch FCM/APNs payloads.';
