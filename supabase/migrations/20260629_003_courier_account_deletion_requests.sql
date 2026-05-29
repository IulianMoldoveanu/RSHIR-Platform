-- Migration: courier_account_deletion_requests
--
-- Audit log for GDPR Art. 17 erasure requests submitted from the courier app's
-- /settings/delete-account screen. Each row records (courier_user_id, email,
-- requested_at) so the eventual scheduled erasure job can mark them
-- completed_at and operations has a paper trail beyond the courier_profiles
-- deletion_requested_at column.
--
-- Per requestAccountDeletion server action, an Edge Function
-- (courier-delete-account-confirm) also sends a Resend confirmation email and
-- inserts the audit row below using the service role key (RLS bypassed).

create table if not exists public.courier_account_deletion_requests (
  id                  uuid primary key default gen_random_uuid(),
  courier_user_id     uuid not null references auth.users(id) on delete cascade,
  email               text not null,
  requested_at        timestamptz not null default now(),
  completed_at        timestamptz,
  created_at          timestamptz not null default now()
);

-- Index for the erasure cron: find all open requests older than 30d.
create index if not exists courier_account_deletion_requests_open_idx
  on public.courier_account_deletion_requests (requested_at)
  where completed_at is null;

-- One open request per courier at a time. Lets us re-request after a prior
-- request is resolved without creating duplicate audit rows live.
create unique index if not exists courier_account_deletion_requests_one_open_uq
  on public.courier_account_deletion_requests (courier_user_id)
  where completed_at is null;

-- RLS: the courier can read their own audit row (so /settings can surface the
-- "deletion requested on X" state). Insert is service-role only — the Edge
-- Function uses the service role key, bypassing RLS.
alter table public.courier_account_deletion_requests enable row level security;

create policy "courier_account_deletion_requests_own_read"
  on public.courier_account_deletion_requests for select
  using (courier_user_id = auth.uid());

comment on table public.courier_account_deletion_requests is
  'GDPR Art. 17 erasure request audit log. Rows are inserted by the '
  'courier-delete-account-confirm Edge Function which also emails the '
  'courier a confirmation. The scheduled erasure job sets completed_at '
  'after the 30-day legal hold expires.';
