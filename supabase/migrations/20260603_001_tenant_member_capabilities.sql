-- Per-member capability flags. The first capability surfaces explicit
-- delegation of delivery-zone management: OWNERs can grant a STAFF member
-- the right to draw / edit / delete delivery zones and pricing tiers.
-- OWNERs always bypass the flag in application code; the column governs
-- non-OWNER access.

alter table public.tenant_members
  add column if not exists can_manage_zones boolean not null default false;

comment on column public.tenant_members.can_manage_zones is
  'When true, this STAFF member can mutate delivery_zones and delivery_pricing_tiers via the admin API. OWNERs bypass this flag in application code. Toggle from /dashboard/settings/team.';

-- Audit log conventions: see lib/audit.ts. Application-level INSERTs
-- carry the actor and the {member_user_id, can_manage_zones} payload.
