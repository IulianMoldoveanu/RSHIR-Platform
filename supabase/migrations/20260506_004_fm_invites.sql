-- Fleet Manager self-invite tokens.
--
-- An OWNER on tenant T creates a row here with a SHA-256-hashed token; the
-- raw token lives only in the share-link the OWNER hands to the FM (out of
-- band — WhatsApp / Telegram / email). When the FM lands on
-- /invite/fm/<token> while signed in with the same email, the accept
-- server action inserts a tenant_members(role='FLEET_MANAGER') row and
-- marks the invite accepted.
--
-- Naming uses "fm_invites" / "fleet_manager.*" — these surfaces are
-- INTERNAL ONLY (platform admin + the FM's own admin login). Merchants
-- never see these rows.
--
-- Additive + idempotent.

create table if not exists public.fm_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- One pending invite per (tenant, email). Allows re-inviting after revoke
-- or accept, but prevents stacking 50 live invites for the same address.
create unique index if not exists fm_invites_tenant_email_pending_uidx
  on public.fm_invites (tenant_id, lower(email))
  where accepted_at is null and revoked_at is null;

-- Lookup index for the accept page (hashes 32 random bytes — high cardinality).
create index if not exists fm_invites_token_hash_idx
  on public.fm_invites (token_hash);

-- Operational lookup for the OWNER pending-invites table.
create index if not exists fm_invites_tenant_created_idx
  on public.fm_invites (tenant_id, created_at desc);

comment on table public.fm_invites is
  'Internal-only. Owner-issued share-link invites for Fleet Manager tenant_members rows. Token is sent out of band via WhatsApp/Telegram/email; only the SHA-256 hash is stored.';

comment on column public.fm_invites.token_hash is
  'SHA-256 hex of the raw token. Raw token is shown to the OWNER ONCE in the share panel and never re-fetchable.';

-- ============================================================
-- RLS
-- ============================================================
-- Service-role (server actions) bypasses RLS. Authenticated read access
-- is granted only to OWNERs of the target tenant so they can see their
-- own pending invites in the team page. Anon has NO access — the accept
-- flow uses the service-role client server-side after token verification.

alter table public.fm_invites enable row level security;

drop policy if exists fm_invites_owner_read on public.fm_invites;
create policy fm_invites_owner_read
  on public.fm_invites
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = fm_invites.tenant_id
        and tm.user_id  = auth.uid()
        and tm.role     = 'OWNER'
    )
  );
