-- HIR — github_pr_events: persist GitHub webhook events for AI Chief
-- Inserted by Edge Function github-webhook-intake (HMAC-validated).
-- Service-role only; no authenticated reads. RLS enabled to be explicit.

create table if not exists public.github_pr_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  repo text not null,
  pr_number int,
  pr_title text,
  pr_head_sha text,
  actor text,
  severity text not null check (severity in ('INFO','WARN','CRITICAL')),
  summary text,
  raw_payload jsonb,
  delivery_id text unique,
  notified_telegram boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_github_pr_events_severity_created
  on public.github_pr_events (severity, created_at desc);
create index if not exists idx_github_pr_events_pr_created
  on public.github_pr_events (pr_number, created_at desc);
create index if not exists idx_github_pr_events_repo_created
  on public.github_pr_events (repo, created_at desc);

alter table public.github_pr_events enable row level security;

-- Explicit deny for authenticated users; service-role bypasses RLS automatically.
drop policy if exists github_pr_events_no_authenticated_read on public.github_pr_events;
create policy github_pr_events_no_authenticated_read on public.github_pr_events
  for select to authenticated using (false);
