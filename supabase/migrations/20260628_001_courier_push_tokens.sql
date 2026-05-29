-- Migration: courier_push_tokens
-- Stores native FCM (Android) and APNs (iOS) device tokens for courier push.
-- The Edge Function courier-push-register upserts here on every app launch.
-- The Edge Function courier-push-dispatch reads from here to dispatch FCM/APNs.
--
-- NOTE: courier_profiles PK is user_id (no separate id column). The column is
-- named `courier_user_id` so the FK target is unambiguous and code is explicit.

create table if not exists public.courier_push_tokens (
  id                uuid primary key default gen_random_uuid(),
  courier_user_id   uuid not null references public.courier_profiles(user_id) on delete cascade,
  fcm_token         text not null,
  platform          text not null check (platform in ('android', 'ios', 'web')),
  last_seen_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),

  -- One active token per courier per platform. On re-registration (app reinstall,
  -- token rotation) the token value is updated in-place.
  constraint courier_push_tokens_courier_platform_uq unique (courier_user_id, platform)
);

-- Index for the dispatch query: find all tokens for a given courier.
create index if not exists courier_push_tokens_courier_idx
  on public.courier_push_tokens (courier_user_id);

-- RLS: couriers can only read/write their own tokens.
alter table public.courier_push_tokens enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'courier_push_tokens' and policyname = 'courier_push_tokens_own_read') then
    create policy "courier_push_tokens_own_read"
      on public.courier_push_tokens for select
      using (courier_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'courier_push_tokens' and policyname = 'courier_push_tokens_own_upsert') then
    create policy "courier_push_tokens_own_upsert"
      on public.courier_push_tokens for insert
      with check (courier_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'courier_push_tokens' and policyname = 'courier_push_tokens_own_update') then
    create policy "courier_push_tokens_own_update"
      on public.courier_push_tokens for update
      using (courier_user_id = auth.uid());
  end if;
end $$;

comment on table public.courier_push_tokens is
  'Native FCM/APNs device tokens for courier push notifications. '
  'Upserted by the courier-push-register Edge Function on every app launch. '
  'Read by courier-push-dispatch to dispatch FCM/APNs payloads.';
