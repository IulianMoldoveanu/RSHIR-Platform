-- HIR Courier — Web Push subscriptions
--
-- Stores browser PushSubscription objects per courier so the
-- `courier-push-dispatch` Edge Function can send targeted notifications
-- when a new order arrives for their fleet.
--
-- One courier can have multiple subscriptions (different devices/browsers).
-- Stale subscriptions (device revoked, browser uninstalled) are cleaned up
-- when the push endpoint returns 410 Gone.
--
-- Idempotent. Safe to re-run.

create table if not exists public.courier_push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- JSON stringified PushSubscription: {endpoint, keys: {p256dh, auth}}
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Unique per (user_id, endpoint) — upsert-safe.
  constraint courier_push_subscriptions_user_endpoint unique (user_id, endpoint)
);

-- Couriers may only read/write their own subscriptions.
alter table public.courier_push_subscriptions enable row level security;

drop policy if exists courier_push_own on public.courier_push_subscriptions;
create policy courier_push_own on public.courier_push_subscriptions
  for all to authenticated
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Fast lookup when dispatching: find all subs for couriers in a given fleet.
create index if not exists idx_courier_push_subs_user
  on public.courier_push_subscriptions (user_id);

-- Auto-update updated_at.
create or replace function public.fn_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists trg_courier_push_updated_at on public.courier_push_subscriptions;
create trigger trg_courier_push_updated_at
  before update on public.courier_push_subscriptions
  for each row execute function public.fn_set_updated_at();
