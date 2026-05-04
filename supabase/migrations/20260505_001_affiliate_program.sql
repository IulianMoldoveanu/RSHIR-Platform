-- Affiliate program — separate from the existing reseller program.
-- Resellers (partners table) are vetted, contracted, often white-label, with
-- 25% Y1 / 20% recurring commissions and a 1-tenant-many-referrals model.
-- Affiliates are self-serve, content/influencer-driven; HIR proposes a
-- bounty model (300 RON / restaurant onboarded; 600 RON if affiliate is
-- already a HIR tenant) with shorter attribution window. See
-- ~/.hir/research/affiliate-vs-reseller-models.md for design background.
--
-- Stage 1 (this migration): public application + admin approval surface.
-- Stage 2 (follow-up): tracking links + bounty payouts table.

-- ============================================================
-- affiliate_applications — public POST writes here, admin approves.
-- ============================================================
create table if not exists public.affiliate_applications (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  email           text not null,
  phone           text,
  audience_type   text not null check (audience_type in ('CREATOR', 'BLOGGER', 'CONSULTANT', 'EXISTING_TENANT', 'OTHER')),
  audience_size   int,
  channels        text[] not null default '{}',
  pitch           text not null,
  -- Honeypot field for bot filtering. Real submitters don't fill this.
  honeypot        text,
  ip_hash         text,
  user_agent      text,
  status          text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REJECTED', 'SPAM')),
  reviewed_by     uuid references auth.users(id) on delete set null,
  reviewed_at     timestamptz,
  reviewer_notes  text,
  -- Once approved, link to the corresponding partners row (we re-use the
  -- partners table for affiliates too — same schema, different audience).
  -- Keeps payouts logic uniform across both programs.
  partner_id      uuid references public.partners(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists affiliate_applications_status_idx
  on public.affiliate_applications (status, created_at desc);
create index if not exists affiliate_applications_email_idx
  on public.affiliate_applications (lower(email));

alter table public.affiliate_applications enable row level security;

-- Service-role only. Public POST goes through the API route, never directly.
drop policy if exists "service_role_only_affiliate_applications" on public.affiliate_applications;
create policy "service_role_only_affiliate_applications"
  on public.affiliate_applications for all
  to service_role using (true) with check (true);

-- ============================================================
-- partners.tier — tier ladder for the 2-track design (Affiliate/Bounty +
-- Reseller Partner/Premier). Additive column, default 'BASE'.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partners' and column_name = 'tier'
  ) then
    alter table public.partners add column tier text not null default 'BASE'
      check (tier in ('BASE', 'AFFILIATE', 'PARTNER', 'PREMIER'));
  end if;
end$$;

-- ============================================================
-- partners.bounty_one_shot_ron — for affiliate bounty tracking
-- ============================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partners' and column_name = 'bounty_one_shot_ron'
  ) then
    alter table public.partners add column bounty_one_shot_ron int;
  end if;
end$$;

comment on table public.affiliate_applications is
  'Public-facing application form for the HIR Affiliate program. PENDING rows reviewed by platform-admin via /dashboard/admin/affiliates. APPROVED -> creates a partners row with tier=AFFILIATE.';
comment on column public.partners.tier is
  'BASE = legacy default. AFFILIATE = self-serve content/creator. PARTNER = standard reseller (25/20). PREMIER = top-tier reseller with white-label + territory.';
