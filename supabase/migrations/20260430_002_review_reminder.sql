-- HIR Restaurant Suite - RSHIR-43 Review reminder email
-- Adds the bookkeeping column the new Edge Function needs to avoid double-
-- sending reminders, plus the pg_cron schedule that fires it hourly.
-- Idempotent: safe to re-apply.

-- ============================================================
-- bookkeeping column
-- ============================================================
alter table public.restaurant_orders
  add column if not exists review_reminder_sent_at timestamptz;

create index if not exists restaurant_orders_review_reminder_idx
  on public.restaurant_orders (status, updated_at)
  where review_reminder_sent_at is null;

-- ============================================================
-- pg_cron schedule
-- ============================================================
-- Runs every hour at :15 (offset from the :00 daily-digest job to avoid
-- racing on pg_net's HTTP queue). Each run looks for DELIVERED orders in
-- the [now-30h, now-24h] window that have no review and no reminder sent
-- yet — see the Edge Function for the exact filter.
--
-- Auth piggybacks on `notify_new_order_secret` (same shared secret used by
-- notify-new-order and daily-digest). Operators must seed `review_reminder_url`
-- in vault separately (one-time):
--   select vault.create_secret(
--     'https://qfmeojeipncuxeltnvab.functions.supabase.co/review-reminder',
--     'review_reminder_url',
--     'review-reminder Edge Function URL');

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  existing_jobid bigint;
begin
  select jobid into existing_jobid
  from cron.job
  where jobname = 'review-reminder';

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'review-reminder',
  '15 * * * *',
  $$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets
                  where name = 'review_reminder_url' limit 1),
      headers := jsonb_build_object(
        'Content-Type',        'application/json',
        'x-hir-notify-secret', (select decrypted_secret from vault.decrypted_secrets
                                where name = 'notify_new_order_secret' limit 1)
      ),
      body    := '{}'::jsonb
    );
  $$
);
