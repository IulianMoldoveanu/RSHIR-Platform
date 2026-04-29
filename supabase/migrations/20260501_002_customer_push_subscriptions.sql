-- HIR Restaurant — customer Web Push subscriptions
--
-- Stores PushSubscription objects for anonymous customers on the public
-- /track/<token> page. Scoped to a single restaurant_orders row (not a
-- user account). The edge function notify-customer-status reads this table
-- (service-role only) to fire push notifications when order status changes.
--
-- A customer can subscribe from multiple devices; each endpoint is unique
-- per order via the unique index below.
--
-- Stale endpoints (410 Gone from the push service) are pruned by the edge
-- function that sends notifications.
--
-- Idempotent. Safe to re-run.

create table if not exists public.customer_push_subscriptions (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  order_id    uuid        not null references public.restaurant_orders(id) on delete cascade,
  endpoint    text        not null,
  p256dh      text        not null,
  auth        text        not null,
  created_at  timestamptz not null default now()
);

-- RLS enabled; no public-read policy. Service-role bypasses RLS so the
-- edge function can read/delete subscriptions. Anonymous customers can
-- subscribe via the Next.js API route (which uses the service-role admin
-- client server-side) — they never touch this table directly.
alter table public.customer_push_subscriptions enable row level security;

-- Unique per (order_id, endpoint) — supports safe upsert.
create unique index if not exists idx_customer_push_subs_order_endpoint
  on public.customer_push_subscriptions (order_id, endpoint);

-- Fast lookup by order when dispatching push on status change.
create index if not exists idx_customer_push_subs_order_id
  on public.customer_push_subscriptions (order_id);
