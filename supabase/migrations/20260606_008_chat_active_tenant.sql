-- Lane HEPY-PRA — read-only intent router for the existing operator Telegram chat.
--
-- Stores the "active tenant" per Telegram chat_id so Iulian can issue scoped
-- queries like "cum a mers ieri" without re-typing the slug each time.
--
-- Scope (PR A): operator chat only (ALLOWED_CHAT_ID gated at the Edge Function
-- layer). One row per chat. RLS denies everything to authenticated/anon —
-- service role writes from telegram-command-intake, no end-user access.
--
-- Future PRs (B = owner binding, C = write intents) will reuse this table or
-- add a sibling table; the schema here intentionally stays tiny.
--
-- Fully additive + idempotent.

create table if not exists public.chat_active_tenant (
  chat_id    text primary key,
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create index if not exists chat_active_tenant_tenant_idx
  on public.chat_active_tenant (tenant_id);

alter table public.chat_active_tenant enable row level security;

-- No SELECT/INSERT/UPDATE/DELETE policy → service role only (which bypasses RLS).
-- This matches the access pattern of `command_log` and `pending_confirmations`.

comment on table public.chat_active_tenant is
  'Per-chat active-tenant pointer for the Hepy read-only intent router. Service-role writes only.';
