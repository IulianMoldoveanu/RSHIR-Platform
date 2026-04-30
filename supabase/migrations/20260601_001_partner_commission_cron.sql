-- HIR — Partner Commission monthly cron.
--
-- Schedules the `partner-commission-calc` Edge Function to run on the
-- 2nd of each month at 01:00 UTC. That maps to:
--   - winter (UTC+2): 03:00 Europe/Bucharest
--   - summer DST (UTC+3): 04:00 Europe/Bucharest
-- pg_cron only speaks UTC; the ±1h drift is irrelevant for a monthly
-- aggregation job. Day 2 (not day 1) gives any same-day order
-- straggler — including timezone-edge ones — a settled clock.
--
-- The Edge Function defaults to "previous calendar month, Bucharest
-- local boundaries" when called with no `?period=` param, which is
-- exactly what we want from cron.
--
-- Auth piggybacks on `notify_new_order_secret` (same shared secret used
-- by every other notify-style function). Operators must seed
-- `partner_commission_calc_url` in vault separately (one-time):
--   select vault.create_secret(
--     'https://qfmeojeipncuxeltnvab.functions.supabase.co/partner-commission-calc',
--     'partner_commission_calc_url',
--     'partner-commission-calc Edge Function URL');
--
-- Idempotent: unschedule + reschedule on every apply.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  existing_jobid bigint;
begin
  select jobid into existing_jobid
  from cron.job
  where jobname = 'partner-commission-monthly';

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'partner-commission-monthly',
  '0 1 2 * *',
  $$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets
                  where name = 'partner_commission_calc_url' limit 1),
      headers := jsonb_build_object(
        'Content-Type',        'application/json',
        'x-hir-notify-secret', (select decrypted_secret from vault.decrypted_secrets
                                where name = 'notify_new_order_secret' limit 1)
      ),
      body    := '{}'::jsonb
    );
  $$
);
