-- Pairing notes — minimal coordination surface for FM ↔ OWNER pairs
-- (Option C decision 2026-05-07; real-time chat deferred to Wave 4).
--
-- Today's pairing primitive is `tenant_members` rows where role =
-- 'FLEET_MANAGER': each row pairs one Fleet Manager user with one
-- restaurant tenant. We add four additive columns there so the FM and
-- the OWNER of that tenant can leave each other a single asynchronous
-- note (and the FM their phone), with timestamps for staleness checks.
--
-- Note from Iulian's 2026-05-07 PM lock: when Allocation V1 introduces
-- a fleet-entity-level pairing (courier_fleets ↔ tenants without an
-- explicit FM user), this migration EXTENDS — it does NOT replace —
-- the model. The Allocation V1 schema can carry its own fleet-level
-- notes alongside; nothing here gets dropped.
--
-- Scope intentionally minimal:
--   * note_from_fleet  — FM writes, OWNER reads
--   * note_from_owner  — OWNER writes, FM reads
--   * fm_phone         — FM populates, OWNER taps tel: link
--   * note_*_updated_at — staleness display
--
-- Internal naming (`fleet`/`fm`) is permitted here because tenant_members
-- never reaches the merchant-facing storefront. Per dispatch
-- confidentiality rule, merchant surfaces never reference fleet — only
-- the in-tenant /dashboard/settings/team page (OWNER + FM context) and
-- the /dashboard/admin/fleet-managers (PLATFORM_ADMIN context) read
-- these columns.
--
-- Idempotent. All defaults are NULL so existing rows keep working.

alter table public.tenant_members
  add column if not exists note_from_fleet text;

alter table public.tenant_members
  add column if not exists note_from_owner text;

alter table public.tenant_members
  add column if not exists note_from_fleet_updated_at timestamptz;

alter table public.tenant_members
  add column if not exists note_from_owner_updated_at timestamptz;

alter table public.tenant_members
  add column if not exists fm_phone text;

-- Keep the notes bounded so a copy-paste accident can't bloat the row.
-- 2 KB per note is far above realistic dispatch-coordination usage.
alter table public.tenant_members
  drop constraint if exists tenant_members_note_from_fleet_len_chk;
alter table public.tenant_members
  add constraint tenant_members_note_from_fleet_len_chk
  check (note_from_fleet is null or length(note_from_fleet) <= 2000);

alter table public.tenant_members
  drop constraint if exists tenant_members_note_from_owner_len_chk;
alter table public.tenant_members
  add constraint tenant_members_note_from_owner_len_chk
  check (note_from_owner is null or length(note_from_owner) <= 2000);

alter table public.tenant_members
  drop constraint if exists tenant_members_fm_phone_len_chk;
alter table public.tenant_members
  add constraint tenant_members_fm_phone_len_chk
  check (fm_phone is null or length(fm_phone) <= 32);

comment on column public.tenant_members.note_from_fleet is
  'Async coordination note from the Fleet Manager to the restaurant OWNER. Internal-only — never displayed on customer or storefront surfaces. Real-time chat is deferred to Wave 4.';

comment on column public.tenant_members.note_from_owner is
  'Async coordination note from the restaurant OWNER to the Fleet Manager. Internal-only.';

comment on column public.tenant_members.fm_phone is
  'Optional Fleet Manager contact phone, used to render a tap-to-call link to the OWNER on /dashboard/settings/team. Internal-only.';
