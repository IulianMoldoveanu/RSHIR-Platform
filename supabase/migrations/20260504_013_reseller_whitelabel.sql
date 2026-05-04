-- White-label reseller MVP — extends the existing reseller program (20260507_003).
-- Adds:
--   - partners.code      — unique short identifier for /r/<code> public landing
--   - partners.slug      — pretty URL slug (alternate to code; optional)
--   - partners.landing_settings — jsonb for branded-page config (headline, photo,
--                                  CTA URL, accent color, custom blurb)
--   - partner_visits     — anonymous visit log (ipHash, ua, country)
--
-- All additive. RLS service-role-only on partner_visits.

alter table public.partners
  add column if not exists code text,
  add column if not exists slug text,
  add column if not exists landing_settings jsonb not null default '{}'::jsonb;

create unique index if not exists partners_code_unique
  on public.partners (code) where code is not null;

create unique index if not exists partners_slug_unique
  on public.partners (slug) where slug is not null;

create table if not exists public.partner_visits (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.partners(id) on delete cascade,
  -- Hashed IP (sha256 over ip + monthly-rotating salt) so we can dedupe
  -- without storing raw PII. The salt rotation logic lives in the route.
  ip_hash     text,
  user_agent  text,
  referer     text,
  country     text,
  visited_at  timestamptz not null default now()
);

create index if not exists partner_visits_partner_id_idx
  on public.partner_visits (partner_id, visited_at desc);

alter table public.partner_visits enable row level security;
drop policy if exists "service_role_only_partner_visits" on public.partner_visits;
create policy "service_role_only_partner_visits"
  on public.partner_visits for all
  to service_role using (true) with check (true);

comment on column public.partners.code is
  'Public referral code (8 chars). Used by /r/<code> public landing.';
comment on column public.partners.landing_settings is
  'jsonb: { headline, blurb, cta_url, accent_color, hero_image_url, video_url, testimonials }';
