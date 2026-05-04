-- HIR — sentry_events: persist Sentry alert webhooks for AI Chief
-- Inserted by Edge Function sentry-webhook-intake (HMAC-validated via shared secret).
-- Service-role only; no authenticated reads. RLS enabled to be explicit.
--
-- Sentry sends an `issue.alert` payload (or `event.alert` etc) on rule trigger.
-- We persist once per event_id (unique), classify severity, and ping Telegram for
-- CRITICAL / WARN. Same dedup pattern as github_pr_events.

create table if not exists public.sentry_events (
  id uuid primary key default gen_random_uuid(),
  -- Sentry issue id (string) — used for dedup with rule_id since the same issue
  -- can fire across multiple rules.
  sentry_issue_id text,
  sentry_event_id text,
  rule_id text,
  rule_name text,
  app text,                                            -- customer|vendor|courier|admin|backend|unknown
  project_slug text,
  environment text,
  release text,
  issue_title text,
  issue_url text,
  issue_level text,                                    -- error|warning|info|fatal
  event_count int,
  user_count int,
  severity text not null check (severity in ('INFO','WARN','CRITICAL')),
  summary text,
  raw_payload jsonb,
  -- dedup key: (sentry_issue_id|rule_id|created_minute) ensures we don't
  -- spam Telegram if Sentry retries the webhook within the same minute.
  dedup_key text unique,
  notified_telegram boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_sentry_events_severity_created
  on public.sentry_events (severity, created_at desc);
create index if not exists idx_sentry_events_app_created
  on public.sentry_events (app, created_at desc);
create index if not exists idx_sentry_events_project_created
  on public.sentry_events (project_slug, created_at desc);

alter table public.sentry_events enable row level security;

-- Explicit deny for authenticated users; service-role bypasses RLS automatically.
drop policy if exists sentry_events_no_authenticated_read on public.sentry_events;
create policy sentry_events_no_authenticated_read on public.sentry_events
  for select to authenticated using (false);
