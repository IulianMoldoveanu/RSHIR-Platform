-- Wave 3 — pg_cron tick for the ops-alerts-tick Edge Function.
--
-- Operator setup (run ONCE, after deploying the function):
--   select vault.create_secret(
--     'https://<project-ref>.functions.supabase.co/ops-alerts-tick',
--     'ops_alerts_tick_url',
--     'ops-alerts-tick Edge Function URL');
--
-- Auth piggybacks on notify_new_order_secret (already in vault) and the
-- shared anon JWT (notify_function_anon_jwt) per the existing pg_cron
-- pattern (see 20260606_005_track_realtime_broadcast.sql).

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'ops-alerts-tick') then
    perform cron.schedule(
      'ops-alerts-tick',
      '* * * * *',  -- every minute
      $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets
                 where name = 'ops_alerts_tick_url' limit 1),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' ||
            (select decrypted_secret from vault.decrypted_secrets
              where name = 'notify_function_anon_jwt' limit 1),
          'x-hir-notify-secret',
            (select decrypted_secret from vault.decrypted_secrets
              where name = 'notify_new_order_secret' limit 1)
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
  end if;
end$$;

comment on extension pg_cron is
  'ops-alerts-tick scheduled every minute by 20260526_006. Requires '
  'ops_alerts_tick_url in vault — operator seeds it manually after deploying '
  'the Edge Function. If the secret is missing, the cron call no-ops.';
