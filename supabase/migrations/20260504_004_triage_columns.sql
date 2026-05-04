-- HIR Restaurant Suite — Triage Agent (Phase 2)
--
-- Additive columns + triggers to wire Claude Haiku 4.5 triage agents to
-- feedback_reports and github_pr_events. The triage Edge Functions read the
-- newly-inserted row, classify via Anthropic API (cached system prompt) and
-- write back into the columns added here.
--
-- Phase 1 already added: triage_category / triage_dedupe_of /
-- triage_confidence / triage_reasoning / severity / status on feedback_reports.
-- This migration ONLY adds the columns those weren't enough for, plus the
-- two triggers that fire the new triage Edge Functions via pg_net.
--
-- Idempotent. Safe to re-apply.

-- ============================================================
-- feedback_reports: extra triage columns
-- ============================================================
alter table public.feedback_reports
  add column if not exists triage_auto_fix_eligible boolean,
  add column if not exists triage_auto_fix_scope text,
  add column if not exists triage_at timestamptz,
  add column if not exists triage_routed_to_fix boolean not null default false;

create index if not exists idx_feedback_reports_triage_routed
  on public.feedback_reports (triage_routed_to_fix, created_at desc)
  where triage_routed_to_fix = true;

-- ============================================================
-- github_pr_events: triage columns
-- ============================================================
alter table public.github_pr_events
  add column if not exists triage_decision jsonb,
  add column if not exists triage_at timestamptz,
  add column if not exists triage_routed_to_fix boolean not null default false;

create index if not exists idx_github_pr_events_triage_routed
  on public.github_pr_events (triage_routed_to_fix, created_at desc)
  where triage_routed_to_fix = true;

-- ============================================================
-- TRIGGER: feedback_reports → triage-feedback Edge Function
-- ============================================================
-- Operator setup (run ONCE, separately):
--   select vault.create_secret(
--     'https://qfmeojeipncuxeltnvab.functions.supabase.co/triage-feedback',
--     'triage_feedback_url',
--     'triage-feedback Edge Function URL');
-- Reuses notify_new_order_secret as the shared trigger gate (same pattern as
-- feedback-notify-on-insert). If either vault entry is missing the trigger
-- becomes a no-op so this migration is safe to apply before secrets are seeded.

create or replace function public.notify_feedback_for_triage()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'triage_feedback_url' limit 1;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'notify_new_order_secret' limit 1;
  if v_url is null or v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',        'application/json',
      'x-hir-notify-secret', v_secret
    ),
    body    := jsonb_build_object(
      'feedback_id', new.id,
      'tenant_id',   new.tenant_id
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_feedback_reports_triage on public.feedback_reports;
create trigger trg_feedback_reports_triage
  after insert on public.feedback_reports
  for each row
  execute function public.notify_feedback_for_triage();

-- ============================================================
-- TRIGGER: github_pr_events → triage-github-event Edge Function
-- Only fires for severity in (CRITICAL, WARN). INFO is noise.
-- ============================================================
-- Operator setup (run ONCE, separately):
--   select vault.create_secret(
--     'https://qfmeojeipncuxeltnvab.functions.supabase.co/triage-github-event',
--     'triage_github_event_url',
--     'triage-github-event Edge Function URL');

create or replace function public.notify_github_event_for_triage()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_url    text;
  v_secret text;
begin
  if new.severity not in ('CRITICAL', 'WARN') then
    return new;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'triage_github_event_url' limit 1;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'notify_new_order_secret' limit 1;
  if v_url is null or v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',        'application/json',
      'x-hir-notify-secret', v_secret
    ),
    body    := jsonb_build_object(
      'event_id', new.id
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_github_pr_events_triage on public.github_pr_events;
create trigger trg_github_pr_events_triage
  after insert on public.github_pr_events
  for each row
  execute function public.notify_github_event_for_triage();
