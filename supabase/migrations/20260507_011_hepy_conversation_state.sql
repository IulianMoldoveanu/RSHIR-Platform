-- Lane HEPY-RESERVATION-BOOKING — multi-step conversation state for the
-- Hepy Telegram bot.
--
-- The /rezerva intent can either be a one-liner ("rezervă masă pentru 4
-- persoane mâine la 19:00, telefon 0712345678, nume Iulian") or a
-- step-by-step dialog where Hepy asks the user for the missing fields one
-- at a time. To support the latter we need to remember partial bookings
-- between Telegram messages.
--
-- Design notes:
--   - One row per (telegram_user_id, tenant_id) at most. Re-issuing
--     /rezerva discards the previous half-completed booking.
--   - 10-minute TTL — enforced in app code on read AND swept by pg_cron
--     (cleanup is best-effort; the read-side check is authoritative).
--   - Service-role only writes; OWNERs may read their own row to power
--     a future "you have a draft reservation in progress" UI nudge but
--     that's out of scope for v1.
--   - `payload` is opaque JSONB owned by the bot; schema is stamped via
--     a `version` field inside the JSON so we can evolve the dialog
--     without a migration.

create table if not exists public.hepy_conversation_state (
  id                  uuid primary key default gen_random_uuid(),
  telegram_user_id    bigint not null,
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  intent              text not null,
  payload             jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  expires_at          timestamptz not null default (now() + interval '10 minutes')
);

-- Only one active conversation per (telegram_user_id, tenant_id, intent).
-- A new /rezerva from the same user replaces the prior draft via UPSERT.
create unique index if not exists hepy_conversation_state_active_uidx
  on public.hepy_conversation_state (telegram_user_id, tenant_id, intent);

-- Sweep index — a future pg_cron job (or manual prune) deletes rows past
-- expires_at. Not strictly required since the read-side check guards the
-- correctness, but keeps the table tiny over time.
create index if not exists hepy_conversation_state_expires_idx
  on public.hepy_conversation_state (expires_at);

comment on table public.hepy_conversation_state is
  'Short-lived (10 min TTL) per-(telegram_user_id, tenant_id, intent) draft for multi-turn Hepy dialogs (e.g. /rezerva). Service-role writes; OWNERs can read their own.';

-- ============================================================
-- RLS
-- ============================================================
alter table public.hepy_conversation_state enable row level security;

-- Defense-in-depth: revoke direct grants; service role bypasses RLS.
revoke all on public.hepy_conversation_state from anon, authenticated;

-- OWNER may SELECT their own drafts (joined through hepy_owner_bindings).
-- This is read-only nice-to-have for a future admin pill; v1 doesn't
-- consume it but the policy is cheap to add now.
drop policy if exists hepy_conversation_state_owner_read on public.hepy_conversation_state;
create policy hepy_conversation_state_owner_read
  on public.hepy_conversation_state
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.hepy_owner_bindings b
       where b.tenant_id = hepy_conversation_state.tenant_id
         and b.telegram_user_id = hepy_conversation_state.telegram_user_id
         and b.owner_user_id = auth.uid()
         and b.unbound_at is null
    )
  );

grant select on public.hepy_conversation_state to authenticated;

-- ============================================================
-- Audit log action keys (documented; no schema change):
--   hepy_reservation_created
--   hepy_reservation_cancelled
--   hepy_reservation_listed
-- ============================================================
