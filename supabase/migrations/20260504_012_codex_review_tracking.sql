-- Codex review tracking for the auto-fix-with-Codex pattern.
-- After Fix Agent opens a PR (Phase 3+4 pipeline), this table tracks the
-- Codex review wait window. The codex-review-poll cron checks PRs older
-- than 3 min, parses Codex comments, and either auto-merges or escalates.

create table if not exists public.codex_review_tracking (
  id              uuid primary key default gen_random_uuid(),
  fix_attempt_id  uuid not null references public.fix_attempts(id) on delete cascade,
  pr_number       int  not null,
  opened_at       timestamptz not null default now(),
  last_polled_at  timestamptz,
  poll_count      int  not null default 0,
  status          text not null default 'WAITING_CODEX'
    check (status in ('WAITING_CODEX','CODEX_GREEN','CODEX_FLAGGED','RETRY','DONE','FAILED')),
  codex_verdict   jsonb,
  codex_comment_count int not null default 0,
  retry_count     int not null default 0,
  final_action    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (pr_number)
);

create index if not exists idx_codex_review_tracking_status
  on public.codex_review_tracking (status, opened_at);

alter table public.codex_review_tracking enable row level security;
drop policy if exists "service_role_only_codex_review_tracking" on public.codex_review_tracking;
create policy "service_role_only_codex_review_tracking"
  on public.codex_review_tracking for all
  to service_role using (true) with check (true);
