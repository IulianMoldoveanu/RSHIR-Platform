-- HIR Reseller v3 — extend partner_commissions for override + champion + wave deltas
--
-- The commission engine v3 writes richer rows than v2:
--   * commission_type — 'DIRECT' | 'OVERRIDE' | 'CHAMPION_GIFT' | 'WAVE_BONUS'
--   * source_partner_id — for OVERRIDE rows, the sub-reseller whose revenue
--     generated this commission. Null for DIRECT.
--   * pct_applied — exact % applied (audit trail)
--
-- This is ADDITIVE and NON-DESTRUCTIVE: the v2 unique constraint
-- (referral_id, period_start, period_end) is preserved so the v2 commission
-- engine ON CONFLICT clause keeps working for DIRECT rows. OVERRIDE/CHAMPION/
-- WAVE_BONUS rows use the new partial unique index below.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partner_commissions' and column_name = 'commission_type'
  ) then
    alter table public.partner_commissions add column commission_type text not null default 'DIRECT'
      check (commission_type in ('DIRECT','OVERRIDE','CHAMPION_GIFT','WAVE_BONUS'));
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partner_commissions' and column_name = 'source_partner_id'
  ) then
    alter table public.partner_commissions add column source_partner_id uuid
      references public.partners(id) on delete set null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partner_commissions' and column_name = 'pct_applied'
  ) then
    alter table public.partner_commissions add column pct_applied numeric(5,2);
  end if;
end$$;

create index if not exists partner_commissions_type_idx
  on public.partner_commissions (partner_id, commission_type, period_start desc);

create index if not exists partner_commissions_source_idx
  on public.partner_commissions (source_partner_id)
  where source_partner_id is not null;

-- NON-DESTRUCTIVE — the v2 unique (referral_id, period_start, period_end) is
-- preserved as-is. DIRECT rows continue to upsert against it.
--
-- For OVERRIDE rows: unique per (referral_id, period_start, period_end, source_partner_id).
-- v3 engine writes one OVERRIDE row per (sponsor, sub→referral, period).
create unique index if not exists partner_commissions_override_uniq
  on public.partner_commissions (referral_id, period_start, period_end, source_partner_id)
  where commission_type = 'OVERRIDE';

-- For CHAMPION_GIFT rows: unique per (referral_id, period_start, period_end).
-- These never have source_partner_id (the champion is the tenant, not a partner).
create unique index if not exists partner_commissions_champion_uniq
  on public.partner_commissions (referral_id, period_start, period_end)
  where commission_type = 'CHAMPION_GIFT';

-- For WAVE_BONUS rows: unique per (referral_id, period_start, period_end).
-- These mirror DIRECT rows but at the wave bonus % delta only.
create unique index if not exists partner_commissions_wave_uniq
  on public.partner_commissions (referral_id, period_start, period_end)
  where commission_type = 'WAVE_BONUS';

comment on column public.partner_commissions.commission_type is
  'v3 — DIRECT (own referral, v2 default), OVERRIDE (downline), CHAMPION_GIFT (restaurant-champion), WAVE_BONUS (Wave permanent delta).';

comment on column public.partner_commissions.source_partner_id is
  'v3 — for OVERRIDE rows, the sub-reseller whose revenue produced this commission. Null for DIRECT/CHAMPION/WAVE_BONUS.';

comment on column public.partner_commissions.pct_applied is
  'v3 — exact percentage applied. Audit trail for "why this amount" especially when Wave bonus stacks.';
