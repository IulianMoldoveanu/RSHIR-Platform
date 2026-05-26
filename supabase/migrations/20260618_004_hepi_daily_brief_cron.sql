-- Wave 5.4 — daily 06:00 UTC schedule for Hepi morning brief.
-- Operator must seed:
--   select vault.create_secret(
--     'https://<project-ref>.functions.supabase.co/hepi-daily-brief-tick',
--     'hepi_daily_brief_url',
--     'hepi-daily-brief-tick Edge Function URL');

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'hepi-daily-brief') then
    perform cron.schedule(
      'hepi-daily-brief',
      '0 6 * * *',  -- daily 06:00 UTC (~09:00 RO summer / 08:00 RO winter)
      $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets
                 where name = 'hepi_daily_brief_url' limit 1),
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
