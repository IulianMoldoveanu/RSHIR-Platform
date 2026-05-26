-- Chat Support Wolt-style — bot first, operator on escalation, call as last resort.
-- Per Iulian 2026-05-22: "wolt raspunde sub 5 minute in chat, deci putem seta un
-- chat bot support care incearca sa le rezolve problemele minimale, daca nu sunt
-- trimisi la operatori, putem adauga buton de call doar dupa ce vedem ca lucrurile
-- chiar nu se rezolva dintr un simplu mesaj."
--
-- Flow:
--   1. Courier opens chat → bot greets + suggests common topics (proof issue,
--      payment delay, address wrong, app crash).
--   2. Bot answers from FAQ. If user says "vorbesc cu cineva" or unrecognised
--      problem → escalate to OPERATOR_QUEUE.
--   3. Operator (Iulian, manual for now) picks up via Telegram → replies.
--   4. If 2 messages exchanged with operator and not resolved → show CALL button.

-- One conversation row per session (a session resets after 24h idle).
create table if not exists public.support_conversations (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  -- 'courier' | 'patron' (single chat infra reused for both surfaces later).
  user_role       text        not null check (user_role in ('courier', 'patron')),
  status          text        not null default 'BOT'
                              check (status in ('BOT', 'OPERATOR_QUEUE', 'OPERATOR_ACTIVE', 'RESOLVED', 'ABANDONED')),
  -- Set when an operator first replies. Used to render "[operator] is typing".
  operator_user_id uuid       references auth.users(id) on delete set null,
  -- Counter of operator-side messages — used to gate the CALL escalation button.
  operator_message_count int  not null default 0,
  -- Topic categorisation from bot triage (proof, payment, address, app, other).
  topic           text,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  resolved_at     timestamptz
);

create index if not exists idx_support_conversations_user
  on public.support_conversations (user_id, last_message_at desc);

create index if not exists idx_support_conversations_queue
  on public.support_conversations (status, last_message_at)
  where status in ('OPERATOR_QUEUE', 'OPERATOR_ACTIVE');

-- Append-only message log.
create table if not exists public.support_messages (
  id              uuid        primary key default gen_random_uuid(),
  conversation_id uuid        not null references public.support_conversations(id) on delete cascade,
  -- 'user' = end user (courier/patron), 'bot' = automated, 'operator' = HIR staff.
  sender          text        not null check (sender in ('user', 'bot', 'operator')),
  body            text        not null,
  -- For bot messages, the rule/template id that produced it (debug + analytics).
  bot_intent      text,
  -- Suggested replies for the user (quick-tap buttons). JSONB array of {label, value}.
  quick_replies   jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_support_messages_conversation
  on public.support_messages (conversation_id, created_at);

-- Trigger to bump conversation.last_message_at on any new message.
create or replace function public.support_conversation_touch()
returns trigger
language plpgsql
as $$
begin
  update public.support_conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists support_messages_touch on public.support_messages;
create trigger support_messages_touch
  after insert on public.support_messages
  for each row execute function public.support_conversation_touch();

-- RLS
alter table public.support_conversations enable row level security;
alter table public.support_messages      enable row level security;

-- User sees their own conversations.
drop policy if exists "support_conversations_owner_select" on public.support_conversations;
create policy "support_conversations_owner_select"
  on public.support_conversations for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "support_conversations_owner_insert" on public.support_conversations;
create policy "support_conversations_owner_insert"
  on public.support_conversations for insert
  to authenticated
  with check (user_id = auth.uid() and status = 'BOT');

-- Update by user only allowed to bump status to RESOLVED/ABANDONED on own row.
-- Other transitions go through service_role (bot/operator backend).
drop policy if exists "support_conversations_owner_close" on public.support_conversations;
create policy "support_conversations_owner_close"
  on public.support_conversations for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and status in ('RESOLVED', 'ABANDONED'));

-- Service-role full access (bot/operator backend, dashboards).
drop policy if exists "support_conversations_service_role_all" on public.support_conversations;
create policy "support_conversations_service_role_all"
  on public.support_conversations for all
  to service_role
  using (true)
  with check (true);

-- Messages: user sees messages in their own conversations + can write 'user' messages.
drop policy if exists "support_messages_owner_select" on public.support_messages;
create policy "support_messages_owner_select"
  on public.support_messages for select
  to authenticated
  using (
    conversation_id in (
      select id from public.support_conversations where user_id = auth.uid()
    )
  );

drop policy if exists "support_messages_owner_insert" on public.support_messages;
create policy "support_messages_owner_insert"
  on public.support_messages for insert
  to authenticated
  with check (
    sender = 'user'
    and conversation_id in (
      select id from public.support_conversations where user_id = auth.uid()
    )
  );

drop policy if exists "support_messages_service_role_all" on public.support_messages;
create policy "support_messages_service_role_all"
  on public.support_messages for all
  to service_role
  using (true)
  with check (true);

comment on table public.support_conversations is
  'Chat support sessions. Status progression: BOT → OPERATOR_QUEUE → OPERATOR_ACTIVE → RESOLVED. Wolt-style: bot tries first, escalate on user request or unrecognised intent.';
comment on table public.support_messages is
  'Append-only chat log. sender ∈ {user, bot, operator}. quick_replies = JSONB array of {label, value} for tap-to-send buttons.';
