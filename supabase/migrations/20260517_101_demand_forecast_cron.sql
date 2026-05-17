-- Demand Forecast — pg_cron job to fire demand-forecast-daily at 04:00 UTC.
--
-- Auth piggybacks on `notify_new_order_secret` (same shared secret used by
-- every other notify-style cron function). The Edge Function checks the
-- `x-hir-notify-secret` header.
--
-- Operator setup (run ONCE before applying this migration):
--   select vault.create_secret(
--     'https://qfmeojeipncuxeltnvab.functions.supabase.co/demand-forecast-daily',
--     'demand_forecast_daily_url',
--     'demand-forecast-daily Edge Function URL'
--   );
--
-- The `notify_new_order_secret` vault entry already exists from
-- 20260428_600_harden_notify_secret.sql — no second secret needed.
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
  where jobname = 'demand-forecast-daily';

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'demand-forecast-daily',
  '0 4 * * *',
  $$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets
                  where name = 'demand_forecast_daily_url' limit 1),
      headers := jsonb_build_object(
        'Content-Type',        'application/json',
        'x-hir-notify-secret', (select decrypted_secret from vault.decrypted_secrets
                                where name = 'notify_new_order_secret' limit 1)
      ),
      body    := '{}'::jsonb
    );
  $$
);
