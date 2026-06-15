-- HIR Reseller Program — Faza 0: minimum-active-vendors threshold.
--
-- Adds `partners.min_vendors_threshold` so the partner-commission-calc cron
-- can gate the DIRECT commission payout: a reseller earns the 20% Y1
-- DIRECT bonus only after they have at least N LIVE vendors attributed
-- (default 5 per Iulian directive 2026-06-15). WAVE_BONUS, OVERRIDE and
-- CHAMPION_GIFT are NOT gated by this threshold — only DIRECT.
--
-- Operational definition (Iulian 2026-06-15): "LIVE vendor" =
-- v_partner_kpis.tenants_live_30d, i.e. distinct referred tenants with
-- at least one delivered order in the last 30 days. Both the cron and the
-- /partner-portal dashboard read from this view so the displayed progress
-- matches the actual payout.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, ALTER COLUMN SET DEFAULT 5 (no-op
-- if already 5; re-asserts the spec default if an ops script drifted it),
-- and COMMENT is replace-style.

alter table public.partners
  add column if not exists min_vendors_threshold int not null default 5;

-- L1 — re-assert the spec default in case the column was created earlier
-- without it or an ops script altered it. Re-running on a healthy DB is a
-- no-op.
alter table public.partners
  alter column min_vendors_threshold set default 5;

comment on column public.partners.min_vendors_threshold is
  'Min LIVE delivering referrals (v_partner_kpis.tenants_live_30d: ≥1 delivered order in last 30d) required to earn DIRECT commission. Default 5 per Iulian directive 2026-06-15. Operational definition prevents paper-tenant gaming. WAVE/OVERRIDE/CHAMPION NOT gated.';
