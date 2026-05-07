-- Lane WHATSAPP-BUSINESS-API-SKELETON — second messaging channel for the
-- AI assistant. Mirrors the Hepy/Telegram binding pattern (migration
-- 20260507_009_hepy_owner_bindings.sql) but for Meta's WhatsApp Business
-- Cloud API. Skeleton only — full intent dispatch + media handling lands
-- in Sprint 15+.
--
-- Three additive tables:
--   1. whatsapp_connect_nonces — short-lived deep-link tokens (1h TTL).
--                                OWNER mints from /dashboard/settings/whatsapp
--                                → a wa.me/<biz>?text=connect%20<nonce> URL.
--                                The webhook consumes it on the first
--                                inbound message that contains the nonce.
--   2. whatsapp_owner_bindings — persistent (wa_phone_number ↔ tenant_id)
--                                mapping. One WhatsApp number binds to
--                                ONE tenant at a time (last-write-wins
--                                rebind preserved as audit trail via
--                                partial unique on unbound_at IS NULL).
--   3. whatsapp_messages       — message log (inbound + outbound). Useful
--                                for debug + GDPR DSAR + Sprint 15 intent
--                                replay. 90d retention enforced by future
--                                cron (not in this PR).
--
-- RLS: service-role only writes; OWNER may read their own binding row +
-- their tenant's recent messages (for the settings UI). Service role
-- bypasses RLS via the Edge Function.
--
-- WhatsApp Business pricing (Meta, RO market 2026):
--   - 1k free service conversations/month per WABA.
--   - ~$0.005-0.01 per service conversation thereafter.
--   - 24h "service window" — replies inside 24h of an inbound message
--     are free; templates outside window are charged separately
--     (templates require Meta approval, NOT in scope for this skeleton).
--
-- Iulian-action AFTER merge: Meta Business Manager verification +
-- WhatsApp Business API approval (~3-7 days) + paste WHATSAPP_PHONE_ID
-- + WHATSAPP_ACCESS_TOKEN + META_APP_SECRET + WHATSAPP_VERIFY_TOKEN
-- secrets via Mgmt API. The Edge Function NO-OPs gracefully when
-- secrets are missing (returns 503 + logs).

-- ============================================================
-- 1. whatsapp_connect_nonces — one-shot deep-link tokens
-- ============================================================

create table if not exists public.whatsapp_connect_nonces (
  nonce            text primary key,
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  owner_user_id    uuid not null references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now(),
  consumed_at      timestamptz,
  consumed_by_wa   text  -- E.164 phone number that redeemed it
);

create index if not exists whatsapp_connect_nonces_created_idx
  on public.whatsapp_connect_nonces (created_at);

create index if not exists whatsapp_connect_nonces_owner_idx
  on public.whatsapp_connect_nonces (owner_user_id, created_at desc)
  where consumed_at is null;

comment on table public.whatsapp_connect_nonces is
  'One-shot tokens minted by /dashboard/settings/whatsapp. WhatsApp webhook consumes them on first inbound message containing "connect <nonce>". 1h TTL enforced in app code; cleaned by manual sweep.';

-- ============================================================
-- 2. whatsapp_owner_bindings — persistent mapping
-- ============================================================

create table if not exists public.whatsapp_owner_bindings (
  id                  uuid primary key default gen_random_uuid(),
  wa_phone_number     text not null,            -- E.164, e.g. "+40712345678"
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  owner_user_id       uuid not null references auth.users(id) on delete cascade,
  wa_display_name     text,                     -- WhatsApp profile name (best-effort)
  bound_at            timestamptz not null default now(),
  last_active_at      timestamptz,
  unbound_at          timestamptz
);

-- One WhatsApp number may only have one ACTIVE binding at a time. We
-- model "active" as unbound_at IS NULL via a partial unique index so the
-- audit trail of past bindings stays preserved.
create unique index if not exists whatsapp_owner_bindings_active_wa_uidx
  on public.whatsapp_owner_bindings (wa_phone_number)
  where unbound_at is null;

-- An OWNER may also only have one ACTIVE binding at a time per tenant
-- (re-issuing replaces the prior one). Same partial-unique pattern.
create unique index if not exists whatsapp_owner_bindings_active_owner_tenant_uidx
  on public.whatsapp_owner_bindings (owner_user_id, tenant_id)
  where unbound_at is null;

create index if not exists whatsapp_owner_bindings_owner_idx
  on public.whatsapp_owner_bindings (owner_user_id, bound_at desc);

create index if not exists whatsapp_owner_bindings_tenant_idx
  on public.whatsapp_owner_bindings (tenant_id);

comment on table public.whatsapp_owner_bindings is
  'Maps WhatsApp Business numbers to RSHIR tenant OWNERs for the WhatsApp channel. Service-role writes. OWNERs read their own row from /dashboard/settings/whatsapp.';

-- ============================================================
-- 3. whatsapp_messages — inbound + outbound message log
-- ============================================================

create table if not exists public.whatsapp_messages (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid references public.tenants(id) on delete cascade,
  binding_id          uuid references public.whatsapp_owner_bindings(id) on delete set null,
  direction           text not null check (direction in ('inbound', 'outbound')),
  wa_phone_number     text not null,
  wa_message_id       text,                     -- Meta's wamid; nullable for outbound failures
  message_type        text not null,            -- 'text' | 'system' | 'template' | 'unsupported'
  body                text,                     -- text payload (truncated at 4096)
  intent              text,                     -- resolved intent name, when known
  raw_payload         jsonb,                    -- full Meta envelope for debug
  sent_at             timestamptz not null default now(),
  error_text          text                      -- non-null when send failed
);

create index if not exists whatsapp_messages_tenant_sent_idx
  on public.whatsapp_messages (tenant_id, sent_at desc);

create index if not exists whatsapp_messages_phone_sent_idx
  on public.whatsapp_messages (wa_phone_number, sent_at desc);

create unique index if not exists whatsapp_messages_wa_message_id_uidx
  on public.whatsapp_messages (wa_message_id)
  where wa_message_id is not null;

comment on table public.whatsapp_messages is
  'WhatsApp message log (inbound + outbound). 90d retention via future cron. Used for debug, GDPR DSAR, intent replay.';

-- ============================================================
-- RLS — service-role writes; OWNER reads own bindings + tenant messages
-- ============================================================

alter table public.whatsapp_connect_nonces enable row level security;
alter table public.whatsapp_owner_bindings enable row level security;
alter table public.whatsapp_messages       enable row level security;

revoke all on public.whatsapp_connect_nonces from anon, authenticated;
revoke all on public.whatsapp_owner_bindings from anon, authenticated;
revoke all on public.whatsapp_messages       from anon, authenticated;

-- OWNER reads own bindings (settings page).
drop policy if exists whatsapp_owner_bindings_owner_read on public.whatsapp_owner_bindings;
create policy whatsapp_owner_bindings_owner_read
  on public.whatsapp_owner_bindings
  for select
  to authenticated
  using (owner_user_id = auth.uid());

grant select on public.whatsapp_owner_bindings to authenticated;

-- OWNER reads own pending nonces (revocation UI).
drop policy if exists whatsapp_connect_nonces_owner_read on public.whatsapp_connect_nonces;
create policy whatsapp_connect_nonces_owner_read
  on public.whatsapp_connect_nonces
  for select
  to authenticated
  using (owner_user_id = auth.uid());

grant select on public.whatsapp_connect_nonces to authenticated;

-- Tenant members may read their tenant's recent messages (settings page
-- shows last 20 for debug). Joined via tenant_members table — same
-- pattern used elsewhere in the schema.
drop policy if exists whatsapp_messages_tenant_member_read on public.whatsapp_messages;
create policy whatsapp_messages_tenant_member_read
  on public.whatsapp_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_members tm
      where tm.tenant_id = whatsapp_messages.tenant_id
        and tm.user_id = auth.uid()
        and tm.role = 'OWNER'
    )
  );

grant select on public.whatsapp_messages to authenticated;

-- No INSERT/UPDATE/DELETE policies → service role only.
