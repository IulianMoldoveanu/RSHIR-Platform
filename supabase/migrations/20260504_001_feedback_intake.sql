-- HIR Restaurant Suite — Feedback Intake (Phase 1)
-- Vendor-driven self-improvement: each tenant member can submit a feedback
-- report (bug / suggestion / question) with optional screenshot + auto-
-- captured console excerpt. Phase 2-5 (Triage / Fix / Supervisor / Growth
-- agents) reuse this table via trigger-driven Edge Functions; columns for
-- those phases are added now so later migrations stay additive.
--
-- See FEEDBACK_LOOP_ARCHITECTURE.md for the full pipeline. This migration
-- is Phase 1 ONLY — table, indexes, RLS, storage bucket + bucket policies,
-- and an INSERT trigger that fires `feedback-notify-on-insert` via pg_net.
--
-- Idempotent: safe to re-apply.

-- ============================================================
-- TABLE
-- ============================================================
create table if not exists public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  reporter_user_id uuid references auth.users(id) on delete set null,
  category text not null check (category in ('BUG','UX_FRICTION','FEATURE_REQUEST','QUESTION')),
  severity text check (severity in ('P0','P1','P2','P3')),
  description text not null,
  screenshot_path text,
  url text,
  user_agent text,
  console_log_excerpt text,
  status text not null default 'NEW' check (status in (
    'NEW','TRIAGED','FIX_ATTEMPTED','FIX_PROPOSED','FIX_AUTO_MERGED',
    'HUMAN_FIX_NEEDED','RESOLVED','DUPLICATE','REJECTED'
  )),
  -- Phase 2 columns (Triage Agent) — nullable, populated later.
  triage_category text,
  triage_dedupe_of uuid references public.feedback_reports(id) on delete set null,
  triage_confidence numeric(3,2),
  triage_reasoning text,
  -- Phase 3 columns (Fix Agent)
  fix_pr_url text,
  fix_pr_number int,
  fix_diff_lines int,
  fix_files_touched text[],
  -- Phase 4 columns (Supervisor)
  supervisor_score int,
  supervisor_decision text check (supervisor_decision in ('AUTO_MERGE','PROPOSE','REJECT')),
  supervisor_reasoning text,
  -- Lifecycle
  resolved_at timestamptz,
  notified_reporter_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_feedback_reports_status_created
  on public.feedback_reports(status, created_at desc);
create index if not exists idx_feedback_reports_tenant
  on public.feedback_reports(tenant_id, created_at desc);
create index if not exists idx_feedback_reports_severity_open
  on public.feedback_reports(severity)
  where severity in ('P0','P1');

-- ============================================================
-- updated_at maintenance
-- ============================================================
create or replace function public.feedback_reports_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_feedback_reports_updated_at on public.feedback_reports;
create trigger trg_feedback_reports_updated_at
  before update on public.feedback_reports
  for each row
  execute function public.feedback_reports_set_updated_at();

-- ============================================================
-- RLS — vendor sees own tenant's reports; service_role bypasses
-- ============================================================
alter table public.feedback_reports enable row level security;

drop policy if exists feedback_reports_tenant_member_select on public.feedback_reports;
create policy feedback_reports_tenant_member_select
  on public.feedback_reports
  for select
  to authenticated
  using (
    tenant_id is not null
    and exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = feedback_reports.tenant_id
        and tm.user_id  = auth.uid()
    )
  );

drop policy if exists feedback_reports_tenant_member_insert on public.feedback_reports;
create policy feedback_reports_tenant_member_insert
  on public.feedback_reports
  for insert
  to authenticated
  with check (
    reporter_user_id = auth.uid()
    and tenant_id is not null
    and exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = feedback_reports.tenant_id
        and tm.user_id  = auth.uid()
    )
  );

-- No UPDATE / DELETE policies for authenticated — only service_role mutates
-- (e.g., Iulian's dashboard "mark resolved" goes through a server action with
-- service_role + email gate, mirroring how audit_log writes work).

-- ============================================================
-- STORAGE BUCKET — private, signed URLs only
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('tenant-feedback-screenshots', 'tenant-feedback-screenshots', false)
  on conflict (id) do nothing;

-- Authenticated tenant members may upload into their tenant prefix.
-- Path convention: <tenant_id>/<feedback_id>.<ext>
drop policy if exists feedback_screenshot_member_upload on storage.objects;
create policy feedback_screenshot_member_upload
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'tenant-feedback-screenshots'
    and (storage.foldername(name))[1] in (
      select tm.tenant_id::text
      from public.tenant_members tm
      where tm.user_id = auth.uid()
    )
  );

-- Reads only via service_role (signed URLs handed out by the dashboard).
drop policy if exists feedback_screenshot_service_read on storage.objects;
create policy feedback_screenshot_service_read
  on storage.objects
  for select
  to service_role
  using (bucket_id = 'tenant-feedback-screenshots');

-- ============================================================
-- TELEGRAM ALERT — pg_trigger → pg_net → feedback-notify-on-insert
-- ============================================================
-- Mirrors the notify_customer_status_changed pattern. Reads the function URL
-- and shared secret from vault. If either is missing the trigger is a no-op,
-- so this migration is safe to apply before secrets are seeded.
--
-- Operator setup (run ONCE, separately):
--   select vault.create_secret(
--     'https://qfmeojeipncuxeltnvab.functions.supabase.co/feedback-notify-on-insert',
--     'feedback_notify_url',
--     'feedback-notify-on-insert Edge Function URL');
-- The shared secret reuses notify_new_order_secret to avoid yet another vault
-- entry; the Edge Function reads HIR_NOTIFY_SECRET from its own env.

create or replace function public.notify_feedback_inserted()
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
    from vault.decrypted_secrets where name = 'feedback_notify_url' limit 1;
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
      'tenant_id',   new.tenant_id,
      'category',    new.category
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_feedback_reports_notify on public.feedback_reports;
create trigger trg_feedback_reports_notify
  after insert on public.feedback_reports
  for each row
  execute function public.notify_feedback_inserted();
