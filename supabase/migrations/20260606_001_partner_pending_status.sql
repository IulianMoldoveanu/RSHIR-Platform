-- Lane T — self-service partner portal.
--
-- Additive schema for the public /parteneriat/inscriere flow:
--   1. Allow `partners.status = 'PENDING'` (was: only ACTIVE/SUSPENDED/REVOKED).
--      The self-service signup creates the partners row with status=PENDING
--      *before* admin approval. Approval flips PENDING -> ACTIVE.
--   2. `tenants.referral_code` — denormalized audit trail of the partner code
--      that drove the signup. `partner_referrals.partner_id` is the source of
--      truth for commission attribution; this column is a convenience for
--      reporting + a fallback when partners.code mutates.
--
-- All changes are additive and idempotent. Safe to re-run.

-- ============================================================
-- partners.status — extend check constraint to include 'PENDING'
-- ============================================================
do $$
declare
  cname text;
begin
  -- Drop whichever check constraint currently restricts partners.status.
  -- The original migration named it implicitly via `check (status in ...)`
  -- inside the create-table, so the constraint name is auto-generated.
  for cname in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'partners'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.partners drop constraint %I', cname);
  end loop;

  alter table public.partners
    add constraint partners_status_check
    check (status in ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED'));
end$$;

comment on column public.partners.status is
  'PENDING = self-signed-up via /parteneriat/inscriere, awaiting admin approval. '
  'ACTIVE = approved + can earn commissions. SUSPENDED / REVOKED = ops actions.';

-- ============================================================
-- tenants.referral_code — audit trail of which partner drove the signup
-- ============================================================
alter table public.tenants
  add column if not exists referral_code text;

create index if not exists tenants_referral_code_idx
  on public.tenants (referral_code)
  where referral_code is not null;

comment on column public.tenants.referral_code is
  'Partner code (partners.code) that drove the signup. Source of truth for '
  'commission attribution is partner_referrals.partner_id; this is a '
  'denormalized convenience field for ad-hoc reporting.';
