-- Marketing assets — files resellers / affiliates can grab.
-- Minimal schema: name, kind, file_url, thumb_url, format, size_bytes.
-- file_url + thumb_url point to a Supabase Storage bucket (TBD by ops);
-- the table just tracks metadata so /reseller/resources can render.

create table if not exists public.marketing_assets (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  kind         text not null check (kind in ('LOGO', 'SOCIAL', 'EMAIL', 'DECK', 'VIDEO', 'BANNER', 'OTHER')),
  description  text,
  file_url     text not null,
  thumb_url    text,
  format       text,
  size_bytes   bigint,
  audience     text not null default 'BOTH'
    check (audience in ('RESELLER', 'AFFILIATE', 'BOTH')),
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists marketing_assets_kind_idx on public.marketing_assets (kind, sort_order);
create index if not exists marketing_assets_active_idx on public.marketing_assets (is_active, audience) where is_active = true;

alter table public.marketing_assets enable row level security;

-- Public read for ACTIVE rows. Resellers + affiliates fetch this from
-- their portals; no PII in the table so public select is safe.
drop policy if exists "public_read_active_marketing_assets" on public.marketing_assets;
create policy "public_read_active_marketing_assets"
  on public.marketing_assets for select
  to anon, authenticated
  using (is_active = true);

-- Writes are service-role only (admin uploads via a future admin page).
drop policy if exists "service_role_write_marketing_assets" on public.marketing_assets;
create policy "service_role_write_marketing_assets"
  on public.marketing_assets for all
  to service_role using (true) with check (true);

comment on table public.marketing_assets is
  'Public marketing assets distributed to resellers + affiliates via /reseller/resources. file_url points to Supabase Storage.';
