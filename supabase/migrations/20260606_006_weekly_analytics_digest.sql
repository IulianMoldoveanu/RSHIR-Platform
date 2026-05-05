-- Lane ANALYTICS-DIGEST (2026-05-05)
--
-- Weekly KPI digest email:
--   - per ACTIVE tenant -> OWNER members (opt-out via settings.weekly_digest_enabled=false)
--   - platform-level   -> Iulian (single hard-coded email; same digest fn, separate path)
--
-- Adds:
--   1. public.analytics_digest_log -- delivery audit (idempotent re-runs allowed).
--   2. pg_cron job 'weekly-analytics-digest' running Mondays 05:00 UTC = 08:00
--      Europe/Bucharest in winter (09:00 in DST; accepted MVP drift, same as
--      daily-digest).
--   3. Vault secret name 'weekly_analytics_digest_url' is reused if present.
--      Operator must set it once via vault.create_secret(...).
--
-- Auth: piggybacks on the same `notify_new_order_secret` shared HMAC the
-- daily-digest + notify-new-order functions use; the Edge Function verifies
-- it constant-time. No new vault entry required for auth.
--
-- Idempotent: CREATE IF NOT EXISTS + cron unschedule/reschedule.

-- ============================================================
-- 1. analytics_digest_log
-- ============================================================
create table if not exists public.analytics_digest_log (
  id              bigserial primary key,
  tenant_id       uuid references public.tenants(id) on delete set null,
  week_start      date not null,
  recipient_email text,
  digest_kind     text not null check (digest_kind in ('TENANT_OWNER','PLATFORM_ADMIN')),
  sent_at         timestamptz,
  delivery_status text not null check (delivery_status in ('SENT','FAILED','SKIPPED')),
  detail          text,
  payload         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists analytics_digest_log_tenant_week_idx
  on public.analytics_digest_log (tenant_id, week_start desc);

create index if not exists analytics_digest_log_kind_week_idx
  on public.analytics_digest_log (digest_kind, week_start desc);

-- RLS: locked down. Service role bypasses; we expose nothing to anon/authed
-- because it contains operator-internal payloads (platform GMV etc.).
alter table public.analytics_digest_log enable row level security;

drop policy if exists analytics_digest_log_no_select on public.analytics_digest_log;
create policy analytics_digest_log_no_select on public.analytics_digest_log
  for select using (false);

-- ============================================================
-- 2. pg_cron schedule -- Mondays 05:00 UTC
-- ============================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  existing_jobid bigint;
begin
  select jobid into existing_jobid
  from cron.job
  where jobname = 'weekly-analytics-digest';

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'weekly-analytics-digest',
  '0 5 * * 1',
  $$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets
                  where name = 'weekly_analytics_digest_url' limit 1),
      headers := jsonb_build_object(
        'Content-Type',        'application/json',
        'x-hir-notify-secret', (select decrypted_secret from vault.decrypted_secrets
                                where name = 'notify_new_order_secret' limit 1)
      ),
      body    := '{}'::jsonb
    );
  $$
);
