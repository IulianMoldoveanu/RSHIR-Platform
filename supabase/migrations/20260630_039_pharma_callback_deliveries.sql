-- 20260630_039_pharma_callback_deliveries.sql
-- ⚠️ REVIEW-READY — apply to prod via the Supabase Management API after staging.
-- Merging this file does NOT auto-apply it (this repo applies migrations manually).
--
-- Durable retry queue for the PHARMA outbound status callback (Lane F).
--
-- Audit board: notifyPharmaCallback (apps/restaurant-courier/src/lib/webhook.ts)
-- sends the courier→pharma status callback with only 2 INLINE attempts and then
-- ABANDONS it (webhook.ts:257-278). If both attempts hit a transient pharma-backend
-- blip, a terminal status (e.g. DELIVERED) is PERMANENTLY lost — the patient and the
-- pharmacy never get it. The stub index idx_courier_orders_pharma_callback_pending
-- (20260504_002) and the "a future sweep can retry" comment were never fulfilled.
--
-- This adds the missing durable outbound queue + a 30s cron-driven dispatcher,
-- modeled exactly on the proven HIR Connect system (connect_webhook_deliveries +
-- connect-webhook-dispatcher, 20260518_011). End-to-end idempotent: the eventId is
-- deterministic per (order, status), the receiver dedups on it
-- (courier-inbound.service.ts), and unique(courier_order_id, event_id) makes a
-- re-enqueue a no-op — so a retry can never double-apply.
--
-- GATING / NO BEHAVIOR CHANGE ON APPLY: applying this migration leaves an EMPTY
-- queue + a cron tick that selects zero rows (and posts to a dispatcher that
-- returns {processed:0}). Nothing enqueues until the matching app code
-- (webhook.ts enqueue) ships. Zero blast radius.
--
-- OPERATOR ONE-TIME PREREQ (so the cron actually reaches the edge fn): seed the
-- dispatcher URL in vault (notify_new_order_secret already exists from 20260428_600):
--   select vault.create_secret(
--     'https://qfmeojeipncuxeltnvab.functions.supabase.co/pharma-callback-dispatcher',
--     'pharma_callback_dispatcher_url',
--     'pharma-callback-dispatcher Edge Function URL');
-- Until seeded, the cron net.http_post targets NULL → harmless no-op.
--
-- Idempotent.

create extension if not exists pg_cron;
create extension if not exists pg_net;

begin;

create table if not exists public.pharma_callback_deliveries (
  id                      uuid primary key default gen_random_uuid(),
  courier_order_id        uuid not null references public.courier_orders(id) on delete cascade,
  event_id                text not null,            -- deterministic ${orderId}:${pharmaStatus}
  pharma_status           text not null,            -- lowercase CourierEventStatus
  pharma_callback_url     text not null,            -- target snapshot at enqueue time
  request_body            jsonb not null,           -- the exact payload to (re-)sign + send
  response_status         int,
  response_body_truncated text,
  attempt_count           int not null default 0,
  next_retry_at           timestamptz not null default now(),
  delivered_at            timestamptz,              -- null until a 2xx
  dead                    boolean not null default false,
  last_error              text,
  created_at              timestamptz not null default now(),
  -- Same (order, status) enqueues exactly once → retries can't fan out duplicates.
  unique (courier_order_id, event_id)
);

create index if not exists ix_pharma_deliveries_pending
  on public.pharma_callback_deliveries(next_retry_at)
  where delivered_at is null and dead = false;
create index if not exists ix_pharma_deliveries_order_created
  on public.pharma_callback_deliveries(courier_order_id, created_at desc);

-- RLS: deny-all for anon + authenticated (the row holds a callback URL + the signed
-- body). service_role bypasses. Mirrors courier_order_secrets (20260605_004), NOT the
-- Connect "members read own" pattern — courier_orders has no tenant_id to scope by.
alter table public.pharma_callback_deliveries enable row level security;

drop policy if exists pharma_callback_deliveries_no_anon_read  on public.pharma_callback_deliveries;
drop policy if exists pharma_callback_deliveries_no_auth_read  on public.pharma_callback_deliveries;
drop policy if exists pharma_callback_deliveries_no_anon_write on public.pharma_callback_deliveries;
drop policy if exists pharma_callback_deliveries_no_auth_write on public.pharma_callback_deliveries;

create policy pharma_callback_deliveries_no_anon_read
  on public.pharma_callback_deliveries for select to anon using (false);
create policy pharma_callback_deliveries_no_auth_read
  on public.pharma_callback_deliveries for select to authenticated using (false);
create policy pharma_callback_deliveries_no_anon_write
  on public.pharma_callback_deliveries for all to anon using (false) with check (false);
create policy pharma_callback_deliveries_no_auth_write
  on public.pharma_callback_deliveries for all to authenticated using (false) with check (false);

revoke all on public.pharma_callback_deliveries from anon, authenticated;

comment on table public.pharma_callback_deliveries is
  'Lane F durable outbound queue: courier→pharma status callbacks. Enqueued by '
  'webhook.ts notifyPharmaCallback; drained by pharma-callback-dispatcher (30s cron) '
  'with exponential backoff + dead-letter. unique(courier_order_id,event_id) + '
  'deterministic eventId + receiver dedup = retries never double-apply.';

commit;

-- Cron: 30s dispatcher tick (idempotent unschedule-before-reschedule). Inert until
-- a row is enqueued AND the vault URL is seeded. Global kill:
--   select cron.unschedule('pharma-callback-dispatch');
do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'pharma-callback-dispatch';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
  perform cron.schedule(
    'pharma-callback-dispatch',
    '30 seconds',
    $cron$
      select net.http_post(
        url     := (select decrypted_secret from vault.decrypted_secrets
                    where name = 'pharma_callback_dispatcher_url' limit 1),
        headers := jsonb_build_object(
          'Content-Type',        'application/json',
          'x-hir-notify-secret', (select decrypted_secret from vault.decrypted_secrets
                                  where name = 'notify_new_order_secret' limit 1)
        ),
        body    := '{}'::jsonb
      );
    $cron$
  );
end$$;
