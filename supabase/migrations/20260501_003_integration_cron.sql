-- HIR Restaurant Suite — RSHIR-53 integration dispatcher cron
-- Schedules the `integration-dispatcher-tick` pg_cron job to fire every
-- 30 seconds so PENDING rows in `integration_events` whose
-- `scheduled_for` has elapsed get drained quickly. The Edge Function
-- (supabase/functions/integration-dispatcher/index.ts) is Mock-only for
-- MVP — see that file's header for scope.
--
-- Auth piggybacks on `notify_new_order_secret` (same shared secret used
-- by notify-new-order, daily-digest, review-reminder). Operators must
-- seed `integration_dispatcher_url` in vault separately (one-time):
--   select vault.create_secret(
--     'https://qfmeojeipncuxeltnvab.functions.supabase.co/integration-dispatcher',
--     'integration_dispatcher_url',
--     'integration-dispatcher Edge Function URL');
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
  where jobname = 'integration-dispatcher-tick';

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

-- pg_cron >= 1.5 supports sub-minute intervals via the "X seconds"
-- form. Supabase's managed Postgres ships pg_cron 1.6+, so this is
-- safe. If a future downgrade breaks this, fall back to '* * * * *'
-- (1-minute cadence) — events still drain, just with worse latency.
select cron.schedule(
  'integration-dispatcher-tick',
  '30 seconds',
  $$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets
                  where name = 'integration_dispatcher_url' limit 1),
      headers := jsonb_build_object(
        'Content-Type',        'application/json',
        'x-hir-notify-secret', (select decrypted_secret from vault.decrypted_secrets
                                where name = 'notify_new_order_secret' limit 1)
      ),
      body    := '{}'::jsonb
    );
  $$
);
