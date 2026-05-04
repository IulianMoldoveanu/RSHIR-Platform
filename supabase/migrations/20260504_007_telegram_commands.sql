-- Telegram command-intake: tables for inbound commands from Iulian's Telegram (Hepi bot).
-- Service-role only; whitelisted chat_id check done in Edge Function.

create table if not exists public.command_log (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  message_id bigint,
  username text,
  command text not null,
  args text,
  result_summary text,
  status text not null check (status in ('OK','ERR','UNAUTHORIZED','CONFIRM_PENDING','CONFIRM_EXPIRED','CONFIRM_DECLINED','UNKNOWN_COMMAND')),
  cost_usd numeric(10,4) not null default 0,
  duration_ms int,
  created_at timestamptz not null default now()
);
create index if not exists idx_command_log_chat_created on public.command_log(chat_id, created_at desc);
create index if not exists idx_command_log_command_created on public.command_log(command, created_at desc);

create table if not exists public.pending_confirmations (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  command text not null,
  args jsonb not null default '{}'::jsonb,
  confirm_code text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  outcome text,
  created_at timestamptz not null default now()
);
create index if not exists idx_pending_conf_active on public.pending_confirmations(chat_id, expires_at) where consumed_at is null;
create unique index if not exists uq_pending_conf_code on public.pending_confirmations(chat_id, confirm_code) where consumed_at is null;

alter table public.command_log enable row level security;
alter table public.pending_confirmations enable row level security;
-- service_role bypasses; no authenticated reads.
drop policy if exists command_log_no_auth on public.command_log;
create policy command_log_no_auth on public.command_log for select to authenticated using (false);
drop policy if exists pending_conf_no_auth on public.pending_confirmations;
create policy pending_conf_no_auth on public.pending_confirmations for select to authenticated using (false);
