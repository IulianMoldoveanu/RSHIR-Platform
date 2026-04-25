-- RSHIR-35: schedule the daily-digest Edge Function via pg_cron.
--
-- Fires once a day at 07:00 UTC = 09:00 Europe/Bucharest in winter
-- (UTC+2). In summer DST (UTC+3) the email lands at 10:00 RO time —
-- accepted MVP drift; revisit if pilots complain. pg_cron only speaks
-- UTC, so we cannot fix this without a tz-aware wrapper.
--
-- The job calls the function with empty body so the function iterates
-- every tenant for yesterday. Auth piggybacks on the same shared
-- secret (`notify_new_order_secret`) used by the order-paid trigger
-- (RSHIR-22) — both functions verify the same `HIR_NOTIFY_SECRET`
-- env var, so one vault entry covers both.
--
-- Idempotent: unschedule + reschedule on every apply.
--
-- Operator setup (run ONCE, separately, with the real value):
--   select vault.create_secret(
--     '<https://qfmeojeipncuxeltnvab.functions.supabase.co/daily-digest>',
--     'daily_digest_url',
--     'daily-digest Edge Function URL');
-- The `notify_new_order_secret` vault entry is reused; no second secret.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  existing_jobid bigint;
begin
  select jobid into existing_jobid
  from cron.job
  where jobname = 'daily-digest';

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'daily-digest',
  '0 7 * * *',
  $$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets
                  where name = 'daily_digest_url' limit 1),
      headers := jsonb_build_object(
        'Content-Type',        'application/json',
        'x-hir-notify-secret', (select decrypted_secret from vault.decrypted_secrets
                                where name = 'notify_new_order_secret' limit 1)
      ),
      body    := '{}'::jsonb
    );
  $$
);
