-- Content OS — pg_cron schedule for the 3 tick endpoints.
--
-- Each cron entry calls the matching Supabase Edge Function, which in
-- turn POSTs to the Next.js admin app's /api/content/*-tick route. The
-- Edge Function is a thin shim so the cron auth happens at the platform
-- boundary (CRON_SHARED_SECRET) and the orchestration logic stays in
-- Node where it can pull from `@hir/content-os`.
--
-- One-time operator setup (NOT in this migration — must be run by hand
-- via Supabase SQL editor before scheduling kicks in):
--   alter database postgres set "app.content_os_tick_url"
--     = 'https://<project-ref>.functions.supabase.co';
--   alter database postgres set "app.content_os_cron_token"
--     = '<CONTENT_OS_CRON_TOKEN — same value as the Vercel env var>';
--
-- See supabase/functions/CONTENT-OS-DEPLOY.md for the full bootstrap.
--
-- Schedules:
--   generate     — 06:00 UTC daily   (one new daily draft per active brand)
--   publish      — hourly            (process scheduled_for<=now() rows)
--   reflect      — 22:00 UTC daily   (pull metrics, promote winners)
--
-- Idempotent: each `cron.schedule(...)` returns the job id; if a job with
-- the same name already exists, pg_cron updates the schedule in place.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Guard: warn (do not fail) when the operator-supplied settings are absent.
-- Without them the http_post body would resolve to NULL and pg_net would
-- silently no-op. We surface a NOTICE so the migration log is loud.
do $$
declare
  url_setting text;
  token_setting text;
begin
  begin
    url_setting := current_setting('app.content_os_tick_url');
  exception when others then
    url_setting := null;
  end;
  begin
    token_setting := current_setting('app.content_os_cron_token');
  exception when others then
    token_setting := null;
  end;

  if url_setting is null or token_setting is null then
    raise notice
      'Content OS pg_cron will be created but inactive — set app.content_os_tick_url and app.content_os_cron_token via ALTER DATABASE before relying on these jobs. See supabase/functions/CONTENT-OS-DEPLOY.md.';
  end if;
end $$;

-- Drop any previous registration so re-running this migration on a
-- different schedule replaces cleanly. pg_cron stores schedules under
-- cron.job; the unique key is the job name (jobname column).
select cron.unschedule('content-os-generate')      where exists (select 1 from cron.job where jobname = 'content-os-generate');
select cron.unschedule('content-os-publish-queue') where exists (select 1 from cron.job where jobname = 'content-os-publish-queue');
select cron.unschedule('content-os-reflect')       where exists (select 1 from cron.job where jobname = 'content-os-reflect');

-- Daily generation at 06:00 UTC.
select cron.schedule(
  'content-os-generate',
  '0 6 * * *',
  $$
    select net.http_post(
      url     := current_setting('app.content_os_tick_url') || '/content-os-generate',
      headers := jsonb_build_object(
                   'Authorization', 'Bearer ' || current_setting('app.content_os_cron_token'),
                   'Content-Type',  'application/json'
                 ),
      body    := '{}'::jsonb
    );
  $$
);

-- Hourly publish queue.
select cron.schedule(
  'content-os-publish-queue',
  '0 * * * *',
  $$
    select net.http_post(
      url     := current_setting('app.content_os_tick_url') || '/content-os-publish-queue',
      headers := jsonb_build_object(
                   'Authorization', 'Bearer ' || current_setting('app.content_os_cron_token'),
                   'Content-Type',  'application/json'
                 ),
      body    := '{}'::jsonb
    );
  $$
);

-- Reflection at 22:00 UTC daily.
select cron.schedule(
  'content-os-reflect',
  '0 22 * * *',
  $$
    select net.http_post(
      url     := current_setting('app.content_os_tick_url') || '/content-os-reflect',
      headers := jsonb_build_object(
                   'Authorization', 'Bearer ' || current_setting('app.content_os_cron_token'),
                   'Content-Type',  'application/json'
                 ),
      body    := '{}'::jsonb
    );
  $$
);

comment on extension pg_cron is
  'Content OS scheduling (3 jobs: content-os-generate, content-os-publish-queue, content-os-reflect). Targets are Supabase Edge Functions which then POST to the admin app.';
