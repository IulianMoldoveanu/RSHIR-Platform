-- Persist failures from the courier handoff (apps/restaurant-web/src/app/
-- api/checkout/order-finalize.ts:dispatchToCourier). Today the function
-- catches exceptions and console.warns, which means a transient courier
-- API outage silently strands paid orders in CONFIRMED state — the
-- restaurant sees the order in admin but no courier is on the way.
--
-- Storing failures lets us:
--   1. Surface them in admin (operator sees "courier dispatch failed —
--      retry?" pill on the order detail page).
--   2. Run a periodic retry edge function that picks rows where
--      next_attempt_at <= now() and replays the dispatch.
--   3. Alert when the same order has 5+ failures (DLQ for ops).
--
-- This migration only adds the table; the application wiring (insert
-- on failure, render in admin, retry edge function) ships in follow-up
-- PRs so review surface stays small.

create table if not exists public.delivery_dispatch_failures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.restaurant_orders(id) on delete cascade,
  -- Snapshot of what we tried to send so the retry can replay without
  -- re-querying the order (e.g. if the order was modified between attempts).
  payload jsonb not null,
  error_message text not null,
  -- HTTP status from the courier API, or null if the failure was network-level
  -- (timeout, DNS, connection refused).
  http_status int,
  attempts int not null default 1,
  -- Set by the retry job: now + exponential backoff (1m, 5m, 30m, 2h, 8h).
  next_attempt_at timestamptz not null default now() + interval '1 minute',
  status text not null default 'PENDING'
    check (status in ('PENDING','RETRYING','SUCCEEDED','DEAD')),
  last_error_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- Pull-pending-jobs query path: status + next_attempt_at index.
create index if not exists delivery_dispatch_failures_pending_idx
  on public.delivery_dispatch_failures (status, next_attempt_at)
  where status = 'PENDING';

-- Per-order lookup so the admin order detail page can render a "dispatch
-- failed N times — retry?" pill in O(1).
create index if not exists delivery_dispatch_failures_order_idx
  on public.delivery_dispatch_failures (order_id);

-- Per-tenant lookup for an admin "all failed dispatches" list view.
create index if not exists delivery_dispatch_failures_tenant_idx
  on public.delivery_dispatch_failures (tenant_id, created_at desc);

alter table public.delivery_dispatch_failures enable row level security;

-- Read: any member of the tenant can see their own failures (for the
-- admin UI). Writes only happen via the service-role key from the
-- finalize handler + the retry edge function — no public write policy.
create policy delivery_dispatch_failures_member_read
  on public.delivery_dispatch_failures
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
       where tm.tenant_id = delivery_dispatch_failures.tenant_id
         and tm.user_id  = auth.uid()
    )
  );
