-- HIR — Bonus Monthly Calculator v3 cron.
--
-- Schedules the `bonus-monthly-calc-v3` Edge Function to run on the
-- 2nd of each month at 02:00 UTC. That maps to:
--   - winter (UTC+2): 04:00 Europe/Bucharest
--   - summer DST (UTC+3): 05:00 Europe/Bucharest
-- Runs AFTER partner-commission-calc (01:00 UTC / 03:00 RO on day 2),
-- giving commissions time to settle before bonus detection begins.
--
-- The Edge Function defaults to "previous calendar month, Bucharest
-- local boundaries" when called with no `?period=` param.
--
-- Auth piggybacks on `notify_new_order_secret` (same shared secret used
-- by every other notify-style function). Operators must seed the URL
-- in vault separately (one-time):
--   select vault.create_secret(
--     'https://qfmeojeipncuxeltnvab.functions.supabase.co/bonus-monthly-calc-v3',
--     'bonus_monthly_calc_v3_url',
--     'bonus-monthly-calc-v3 Edge Function URL');
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
  where jobname = 'bonus-monthly-calc-v3';

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'bonus-monthly-calc-v3',
  '0 2 2 * *',
  $$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets
                  where name = 'bonus_monthly_calc_v3_url' limit 1),
      headers := jsonb_build_object(
        'Content-Type',        'application/json',
        'x-hir-notify-secret', (select decrypted_secret from vault.decrypted_secrets
                                where name = 'notify_new_order_secret' limit 1)
      ),
      body    := '{}'::jsonb
    );
  $$
);
