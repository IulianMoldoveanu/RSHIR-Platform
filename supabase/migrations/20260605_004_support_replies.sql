-- Lane EMAIL-REPLY (2026-05-05) — Admin-side reply thread for support_messages.
--
-- Adds:
--   1. support_replies table — one row per outbound admin reply, with
--      delivery_status tracked from Resend send result.
--   2. RESPONDED status on support_messages.status check constraint.
--
-- Policy mirrors support_messages (Lane U): service-role only access from
-- the admin app — no RLS policies for anon/authenticated. The reply API
-- route enforces platform_admin via HIR_PLATFORM_ADMIN_EMAILS allow-list.

create table if not exists public.support_replies (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.support_messages(id) on delete cascade,
  reply_text text not null,
  reply_html text,
  sent_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz not null default now(),
  delivery_status text not null default 'PENDING'
    check (delivery_status in ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
  delivery_error text,
  resend_id text
);

create index if not exists support_replies_message_idx
  on public.support_replies (message_id);
create index if not exists support_replies_sent_at_idx
  on public.support_replies (sent_at desc);

alter table public.support_replies enable row level security;
-- no anon/authenticated policies = service-role only access (mirrors Lane U)

-- Extend support_messages.status to allow RESPONDED. Drop+recreate the check
-- constraint additively. Idempotent: only acts if the constraint name exists.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'support_messages_status_check'
      and conrelid = 'public.support_messages'::regclass
  ) then
    alter table public.support_messages
      drop constraint support_messages_status_check;
  end if;
end$$;

alter table public.support_messages
  add constraint support_messages_status_check
  check (status in ('NEW','IN_PROGRESS','RESPONDED','RESOLVED','SPAM'));
