-- Lane RESELLER-DASHBOARD-MVP — schema PR1
--
-- Adds the kanban pipeline state for partner referrals + adds a couple of
-- columns to affiliate_applications so a self-signing affiliate can declare
-- "I am also a fleet manager" + "here is my network in 1-2 sentences"
-- (otherwise Iulian has to ask via Telegram = friction). Adds two read-only
-- views the canonical /partner-portal page consumes, so all the joins +
-- computations live in SQL not TSX.
--
-- Decisions baked in:
--   - Canonical dashboard = /partner-portal (newer, PENDING-aware,
--     has invite panel from PR #335). /reseller will be 301'd in PR2.
--   - Affiliate vs Reseller = UNIFIED. Two surfaces for the same program
--     was confusing the funnel. partners.tier (BASE/AFFILIATE/PARTNER/
--     PREMIER) stays — it's the *tier ladder*, not a stream split.
--   - Partner-portal IS allowed to use the word "flotă" (partner-portal
--     is NOT merchant-facing — partners often run fleets themselves).
--     Confidentiality rule applies to merchant-facing surfaces only.
--
-- All changes are ADDITIVE + IDEMPOTENT. Safe to re-run.

-- ============================================================
-- 1. partner_referral_states — kanban pipeline per referral
-- ============================================================
-- A referral starts at LEAD (partner shared the link, no signup yet),
-- progresses through DEMO (call booked / page-visited heavy), CONTRACT
-- (signup happened, tenant exists in PENDING), LIVE (tenant has at least
-- one delivered order), or CHURNED (referral ended_at populated, or no
-- order in 90 days, soft-end).
--
-- The 5-state model mirrors the typical SaaS pipeline. We store
-- transitions, not just current state, so we can compute funnel metrics +
-- drag-drop history. Latest row per referral_id wins as "current state".
create table if not exists public.partner_referral_states (
  id           uuid primary key default gen_random_uuid(),
  referral_id  uuid not null references public.partner_referrals(id) on delete cascade,
  state        text not null
    check (state in ('LEAD', 'DEMO', 'CONTRACT', 'LIVE', 'CHURNED')),
  -- Free-text reason / context. Optional on automated transitions, useful
  -- for partner-typed kanban moves so admin can audit "why did partner X
  -- mark tenant Y as CHURNED".
  reason       text,
  -- Who moved it — auth.uid() of the partner moving in their portal, or
  -- null on system-generated transitions (e.g. CONTRACT auto-set when
  -- signup attribution writes the partner_referrals row).
  changed_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists partner_referral_states_referral_id_idx
  on public.partner_referral_states (referral_id, created_at desc);

create index if not exists partner_referral_states_state_idx
  on public.partner_referral_states (state, created_at desc);

comment on table public.partner_referral_states is
  '5-state kanban (LEAD/DEMO/CONTRACT/LIVE/CHURNED) per partner referral. '
  'Append-only history; latest row per referral_id wins. Powers the '
  'pipeline column on /partner-portal.';

alter table public.partner_referral_states enable row level security;

-- Service-role only writes (server actions). Partners read THEIR OWN
-- referrals' states via the v_partner_kpis view + a join, never directly.
drop policy if exists "service_role_only_referral_states"
  on public.partner_referral_states;
create policy "service_role_only_referral_states"
  on public.partner_referral_states for all
  to service_role using (true) with check (true);

-- ============================================================
-- 2. affiliate_applications — additive columns
-- ============================================================
-- Captures (a) "I am also a fleet manager" so Iulian's outreach knows to
-- also pitch them as fleet operator, not just as restaurant-affiliate;
-- (b) free-text network description so the application form has a place
-- to capture "I run 12 GloriaFood restaurants on Telegram + 4 fleet SRLs
-- in Brașov+Cluj" instead of forcing it into the existing 1000-char
-- pitch field.
alter table public.affiliate_applications
  add column if not exists also_fleet_manager boolean not null default false;

alter table public.affiliate_applications
  add column if not exists network_description text;

comment on column public.affiliate_applications.also_fleet_manager is
  'Self-declared by the applicant on /parteneriat/inscriere: do they '
  'also run a courier fleet (separate from being a HIR-software referrer). '
  'Drives Iulian outreach prioritisation — fleet-manager-affiliates are '
  '2x leverage (software + capacity).';

comment on column public.affiliate_applications.network_description is
  'Free-text description of the applicant network: existing restaurant '
  'relations, fleet operations, geographies covered, GloriaFood account '
  'size, etc. Bounded by application form to ~500 chars.';

-- ============================================================
-- 3. partners.notification_settings — opt-in jsonb
-- ============================================================
-- Stores partner-level email opt-ins for system events. Defaults all-on
-- because a freshly-approved partner WANTS to know when their first
-- referral lands. Per-partner UI toggle in /partner-portal lets them
-- mute specific events later.
alter table public.partners
  add column if not exists notification_settings jsonb not null default
    '{"on_application_approved":true,"on_tenant_went_live":true,"on_tenant_churned":true,"on_commission_paid":true}'::jsonb;

comment on column public.partners.notification_settings is
  'Per-partner email notification opt-ins. Keys: on_application_approved, '
  'on_tenant_went_live, on_tenant_churned, on_commission_paid. Defaults '
  'all true on new partners; togglable from /partner-portal.';

-- ============================================================
-- 4. v_user_active_roles — multi-role detection view
-- ============================================================
-- Returns one row per user_id that has ANY of the 4 roles, with 4
-- boolean flags. Used by the canonical dashboard to render the multi-role
-- sidebar (e.g. "Pieter is BOTH a reseller AND a fleet manager AND owns 2
-- tenants — show all 3 tabs"). Filters out users with zero roles.
--
-- Platform-admin role is INTENTIONALLY NOT computed here — it's checked
-- against the HIR_PLATFORM_ADMIN_EMAILS env var in application code, not
-- in DB. We expose the column as `false` for shape-compat; admin app
-- ORs the env-var check on top.
create or replace view public.v_user_active_roles as
with all_users as (
  select user_id from public.partners where user_id is not null
  union
  select owner_user_id as user_id from public.courier_fleets where owner_user_id is not null
  union
  select user_id from public.tenant_members where user_id is not null
)
select
  u.user_id,
  exists (
    select 1 from public.partners p
    where p.user_id = u.user_id and p.status in ('PENDING', 'ACTIVE')
  ) as is_reseller,
  exists (
    select 1 from public.courier_fleets f
    where f.owner_user_id = u.user_id and f.is_active = true
  ) as is_fleet_manager,
  exists (
    select 1 from public.tenant_members m
    where m.user_id = u.user_id and m.role = 'OWNER'
  ) as is_tenant_owner,
  false as is_platform_admin  -- env-var-driven, see admin app for OR
from all_users u;

comment on view public.v_user_active_roles is
  'Multi-role detection. Used by /partner-portal layout to render '
  'sidebar tabs (Reseller / Fleet Manager / Restaurant). One row per '
  'user_id with at least one role. is_platform_admin is always false '
  'here — actual check is HIR_PLATFORM_ADMIN_EMAILS env var.';

-- View RLS: views inherit underlying table RLS for Supabase v15+. We
-- grant SELECT on the view to authenticated so admin-app server code
-- (using authed session) can read its own row. service_role also reads.
grant select on public.v_user_active_roles to authenticated, service_role;

-- ============================================================
-- 5. v_partner_kpis — aggregated KPIs per partner
-- ============================================================
-- One row per partner with the 7 KPIs the dashboard tile strip needs.
-- Computed from partner_referrals + tenants + restaurant_orders +
-- partner_commissions. Refreshed on read (cheap because partner counts
-- are O(100s) for the foreseeable future).
--
-- Columns:
--   tenants_attributed       — count(*) referrals
--   tenants_live_30d         — distinct referred tenants with >= 1
--                              delivered order in last 30 days
--   tenants_pending          — referred tenants whose tenant.status =
--                              PENDING (not approved yet on tenant side)
--   mrr_generated_30d_cents  — sum of delivered-order commissions in last
--                              30d across all referred tenants
--   commission_y1_cents      — total commission earned across referrals
--                              still within 12 months of referred_at
--   commission_recurring_cents — total commission earned across referrals
--                              past 12 months from referred_at
--   commission_pending_cents — sum of partner_commissions.status=PENDING
create or replace view public.v_partner_kpis as
with refs as (
  select
    pr.partner_id,
    pr.id as referral_id,
    pr.tenant_id,
    pr.referred_at,
    pr.ended_at,
    pr.commission_pct
  from public.partner_referrals pr
),
live_30d as (
  -- restaurant_orders has no `delivered_at` column; we approximate
  -- "delivered in last 30d" with updated_at on DELIVERED rows. The
  -- status transition to DELIVERED bumps updated_at via the standard
  -- updated_at trigger. Margin of error ~hours for late edits.
  select distinct r.partner_id, r.tenant_id
  from refs r
  join public.restaurant_orders o on o.tenant_id = r.tenant_id
  where o.status = 'DELIVERED'
    and o.updated_at >= now() - interval '30 days'
),
pending_tenants as (
  -- tenants.status uses 'ONBOARDING' (not 'PENDING') for not-yet-live
  -- tenants per the initial schema. We expose it as `tenants_pending`
  -- on the view because that's the friendlier label for the dashboard.
  select r.partner_id, r.tenant_id
  from refs r
  join public.tenants t on t.id = r.tenant_id
  where coalesce(t.status, 'ACTIVE') = 'ONBOARDING'
),
commissions_split as (
  select
    pc.partner_id,
    pc.referral_id,
    pc.amount_cents,
    pc.status,
    pr.referred_at,
    case
      when pc.period_start < (pr.referred_at::date + interval '12 months')
        then 'y1'
      else 'recurring'
    end as bucket
  from public.partner_commissions pc
  join public.partner_referrals pr on pr.id = pc.referral_id
)
select
  p.id as partner_id,
  -- count of referrals
  (select count(*)::int from refs r where r.partner_id = p.id) as tenants_attributed,
  -- live in last 30d
  (select count(*)::int from live_30d l where l.partner_id = p.id) as tenants_live_30d,
  -- pending on tenant side
  (select count(*)::int from pending_tenants pt where pt.partner_id = p.id) as tenants_pending,
  -- mrr 30d (from PAID + PENDING commissions whose period overlaps last 30d)
  coalesce((
    select sum(pc.amount_cents)::bigint
    from public.partner_commissions pc
    where pc.partner_id = p.id
      and pc.status in ('PENDING', 'PAID')
      and pc.period_end >= (now() - interval '30 days')::date
  ), 0) as mrr_generated_30d_cents,
  -- y1 (within 12 months of referred_at)
  coalesce((
    select sum(amount_cents)::bigint
    from commissions_split cs
    where cs.partner_id = p.id and cs.bucket = 'y1' and cs.status <> 'VOID'
  ), 0) as commission_y1_cents,
  -- recurring (past 12 months)
  coalesce((
    select sum(amount_cents)::bigint
    from commissions_split cs
    where cs.partner_id = p.id and cs.bucket = 'recurring' and cs.status <> 'VOID'
  ), 0) as commission_recurring_cents,
  -- pending (not yet paid)
  coalesce((
    select sum(amount_cents)::bigint
    from public.partner_commissions pc
    where pc.partner_id = p.id and pc.status = 'PENDING'
  ), 0) as commission_pending_cents
from public.partners p;

comment on view public.v_partner_kpis is
  'KPI aggregates per partner. One row per partner. Reads on demand; '
  'cheap because partner counts stay O(100s) for the foreseeable future. '
  'Powers the 5-tile KPI strip on canonical /partner-portal dashboard.';

grant select on public.v_partner_kpis to authenticated, service_role;
