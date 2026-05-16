-- HIR — Champion Rewards Verify cron (v3 Loop 3 state machine).
--
-- Schedules `champion-rewards-verify` Edge Function to run 4×/day at
-- 04:00 / 10:00 / 16:00 / 22:00 UTC — close-enough hourly verify cadence
-- without burning function invocations. Each run walks pending +
-- trial_active + verified rows and advances the state machine.
--
-- Auth piggybacks on `notify_new_order_secret` (same shared secret used by
-- bonus-monthly-calc-v3 and other notify-style functions). Operator must
-- seed the URL in vault separately (one-time):
--   select vault.create_secret(
--     'https://qfmeojeipncuxeltnvab.functions.supabase.co/champion-rewards-verify',
--     'champion_rewards_verify_url',
--     'champion-rewards-verify Edge Function URL');
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
  where jobname = 'champion-rewards-verify';

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'champion-rewards-verify',
  '0 4,10,16,22 * * *',
  $$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets
                  where name = 'champion_rewards_verify_url' limit 1),
      headers := jsonb_build_object(
        'Content-Type',        'application/json',
        'x-hir-notify-secret', (select decrypted_secret from vault.decrypted_secrets
                                where name = 'notify_new_order_secret' limit 1)
      ),
      body    := '{}'::jsonb
    );
  $$
);
