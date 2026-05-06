-- Lane HEPY-PRB — multi-tenant OWNER binding for the Hepy Telegram bot.
--
-- PR A (chat_active_tenant) gave Iulian a single-operator chat with manual
-- /tenant slug switching. PR B opens the bot to tenant OWNERs: each OWNER
-- can self-serve "Conectează Telegram" from /dashboard/settings/hepy →
-- bot stores (telegram_user_id, tenant_id, owner_user_id) and routes
-- subsequent messages from that Telegram account to that tenant scope.
--
-- Two tables, both additive + idempotent:
--   1. hepy_connect_nonces  — short-lived deep-link tokens (1h TTL).
--                             OWNER generates from the admin UI; the bot
--                             consumes it on /start connect_<nonce>.
--   2. hepy_owner_bindings  — persistent (telegram_user_id ↔ tenant_id)
--                             mapping. One Telegram account binds to ONE
--                             tenant at a time (last-write-wins on rebind).
--
-- RLS: service-role only writes; OWNER may read their own binding row to
-- show "connected as @username" in the settings UI. PR C (write intents)
-- will add a per-action capability check on top of the binding.
--
-- Internal naming convention: "Hepy" is the user-facing brand for the AI
-- assistant. Schema/code use "hepy_*" — never "fleet" leakage on
-- merchant-facing surfaces (Hepy is merchant-facing).

-- ============================================================
-- 1. hepy_connect_nonces — one-shot deep-link tokens
-- ============================================================

create table if not exists public.hepy_connect_nonces (
  nonce            text primary key,
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  owner_user_id    uuid not null references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now(),
  consumed_at      timestamptz,
  consumed_by_tg   bigint
);

-- Cleanup index — pg_cron / manual sweep prunes rows older than 1h that
-- never got consumed.
create index if not exists hepy_connect_nonces_created_idx
  on public.hepy_connect_nonces (created_at);

-- Per-owner active-nonce lookup so a re-click in the admin UI can revoke
-- prior unused nonces (issue-and-replace pattern).
create index if not exists hepy_connect_nonces_owner_idx
  on public.hepy_connect_nonces (owner_user_id, created_at desc)
  where consumed_at is null;

comment on table public.hepy_connect_nonces is
  'One-shot tokens minted by /dashboard/settings/hepy. Bot consumes them on /start connect_<nonce>. 1h TTL enforced in app code; cleaned by manual sweep.';

-- ============================================================
-- 2. hepy_owner_bindings — persistent mapping
-- ============================================================

create table if not exists public.hepy_owner_bindings (
  id                  uuid primary key default gen_random_uuid(),
  telegram_user_id    bigint not null,
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  owner_user_id       uuid not null references auth.users(id) on delete cascade,
  telegram_username   text,
  bound_at            timestamptz not null default now(),
  last_active_at      timestamptz,
  unbound_at          timestamptz
);

-- One Telegram account may only have one ACTIVE binding at a time. We
-- model "active" as unbound_at IS NULL via a partial unique index so the
-- audit trail of past bindings stays preserved.
create unique index if not exists hepy_owner_bindings_active_tg_uidx
  on public.hepy_owner_bindings (telegram_user_id)
  where unbound_at is null;

-- An OWNER may also only have one ACTIVE binding at a time per tenant
-- (re-issuing replaces the prior one). Same partial-unique pattern.
create unique index if not exists hepy_owner_bindings_active_owner_tenant_uidx
  on public.hepy_owner_bindings (owner_user_id, tenant_id)
  where unbound_at is null;

-- Lookup index for the OWNER's own settings page.
create index if not exists hepy_owner_bindings_owner_idx
  on public.hepy_owner_bindings (owner_user_id, bound_at desc);

-- Lookup index for the bot — incoming Telegram message → find tenant.
create index if not exists hepy_owner_bindings_tenant_idx
  on public.hepy_owner_bindings (tenant_id);

comment on table public.hepy_owner_bindings is
  'Maps Telegram accounts to RSHIR tenant OWNERs for the Hepy bot. Service-role writes. OWNERs read their own row from /dashboard/settings/hepy. PR C will add per-action write capabilities on top.';

-- ============================================================
-- RLS
-- ============================================================

alter table public.hepy_connect_nonces enable row level security;
alter table public.hepy_owner_bindings enable row level security;

-- Defense-in-depth lockdown to mirror the security_sweep_v2 grants.
-- Service-role bypasses RLS; everyone else is denied except where a
-- policy explicitly allows.
revoke all on public.hepy_connect_nonces  from anon, authenticated;
revoke all on public.hepy_owner_bindings  from anon, authenticated;

-- OWNER may SELECT their own bindings (used to render "connected as
-- @username, since X" pill in /dashboard/settings/hepy).
drop policy if exists hepy_owner_bindings_owner_read on public.hepy_owner_bindings;
create policy hepy_owner_bindings_owner_read
  on public.hepy_owner_bindings
  for select
  to authenticated
  using (owner_user_id = auth.uid());

grant select on public.hepy_owner_bindings to authenticated;

-- OWNER may SELECT their own pending nonces (to show / revoke from UI).
drop policy if exists hepy_connect_nonces_owner_read on public.hepy_connect_nonces;
create policy hepy_connect_nonces_owner_read
  on public.hepy_connect_nonces
  for select
  to authenticated
  using (owner_user_id = auth.uid());

grant select on public.hepy_connect_nonces to authenticated;

-- No INSERT/UPDATE/DELETE policies → service role only (server actions
-- via createAdminClient + Edge Function via SUPABASE_SERVICE_ROLE_KEY).
