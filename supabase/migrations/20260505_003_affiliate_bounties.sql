-- Affiliate bounty payouts ledger.
-- One row per restaurant onboarding attributed to an AFFILIATE partner.
-- 30-day lock window (status PENDING) before becoming PAYABLE — this gives
-- HIR time to detect & cancel fraudulent / immediately-churning signups.

create table if not exists public.affiliate_bounties (
  id            uuid primary key default gen_random_uuid(),
  partner_id    uuid not null references public.partners(id) on delete cascade,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  amount_ron    int not null check (amount_ron >= 0),
  -- 30-day lock: bounty can be cancelled if the tenant is suspended /
  -- refunded / detected as fraud during the window.
  payable_after timestamptz not null default (now() + interval '30 days'),
  status        text not null default 'PENDING'
    check (status in ('PENDING', 'PAYABLE', 'PAID', 'CANCELLED')),
  paid_at       timestamptz,
  paid_via      text,
  cancelled_reason text,
  created_at    timestamptz not null default now(),
  unique (partner_id, tenant_id)
);

create index if not exists affiliate_bounties_status_idx
  on public.affiliate_bounties (status, payable_after);

alter table public.affiliate_bounties enable row level security;
drop policy if exists "service_role_only_affiliate_bounties" on public.affiliate_bounties;
create policy "service_role_only_affiliate_bounties"
  on public.affiliate_bounties for all
  to service_role using (true) with check (true);

comment on table public.affiliate_bounties is
  'One-shot bounty per restaurant onboarded via an AFFILIATE partner. 30-day PENDING window before becoming PAYABLE. Distinct from partner_commissions (which is the recurring reseller revenue share).';
