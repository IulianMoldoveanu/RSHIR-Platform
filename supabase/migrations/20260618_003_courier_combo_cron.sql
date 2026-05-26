-- Wave 5.2 — pg_cron tick for the courier-combo-tick Edge Function.
--
-- Operator setup (run ONCE, after deploying the function):
--   select vault.create_secret(
--     'https://<project-ref>.functions.supabase.co/courier-combo-tick',
--     'courier_combo_tick_url',
--     'courier-combo-tick Edge Function URL');
--
-- Auth piggybacks on notify_function_anon_jwt + notify_new_order_secret
-- already used by 20260526_006_ops_alerts_cron.sql.

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'courier-combo-tick') then
    perform cron.schedule(
      'courier-combo-tick',
      '*/2 * * * *',  -- every 2 minutes
      $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets
                 where name = 'courier_combo_tick_url' limit 1),
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
  'courier-combo-tick scheduled every 2 minutes by 20260618_003. Requires '
  'courier_combo_tick_url in vault — operator seeds it manually after deploying '
  'the Edge Function. If the secret is missing, the cron call no-ops.';
