-- HIR Courier App — Phase B: pharma → Supabase mirror tables
--
-- Three additions, all idempotent:
--   1. pharma_courier_links  — auth.users.id ↔ pharma Neon user ID
--   2. pharma_webhook_secrets — HMAC secrets per pharma backend instance
--   3. courier_orders.external_ref + courier_orders.pharma_metadata
--      — carry pharma's order ID + RX/ID flags without polluting main schema
--
-- RLS summary:
--   pharma_courier_links  — user reads own row; service role writes
--   pharma_webhook_secrets — service role only
--
-- Strategy doc: docs/strategy/2026-04-29-courier-unification-direction.md

-- ============================================================
-- 1. pharma_courier_links
-- ============================================================
create table if not exists public.pharma_courier_links (
  id uuid primary key default gen_random_uuid(),
  -- Supabase auth user (the courier's login identity)
  supabase_user_id uuid not null references auth.users(id) on delete cascade,
  -- String ID from the Neon/pharma backend (stored as text, not FK)
  pharma_user_id   text not null,
  created_at       timestamptz not null default now()
);

create unique index if not exists uq_pharma_courier_links_supabase
  on public.pharma_courier_links (supabase_user_id);

create unique index if not exists uq_pharma_courier_links_pharma
  on public.pharma_courier_links (pharma_user_id);

alter table public.pharma_courier_links enable row level security;

-- Courier may read their own link record; service role bypasses RLS for writes.
drop policy if exists pharma_courier_links_self_read on public.pharma_courier_links;
create policy pharma_courier_links_self_read
  on public.pharma_courier_links for select to authenticated
  using (supabase_user_id = auth.uid());

-- ============================================================
-- 2. pharma_webhook_secrets
-- ============================================================
-- Stores HMAC-SHA256 key(s) used by the pharma NestJS backend to sign
-- POST requests to the courier-mirror-pharma Edge Function. One row per
-- active secret; rotating creates a new row + deactivates the old one.
--
-- RLS: no read/write policy for authenticated — service role only.
create table if not exists public.pharma_webhook_secrets (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,          -- e.g. 'primary', 'rotation-2026-06'
  secret     text not null,                 -- raw hex key — never expose to anon/auth
  is_active  boolean not null default true,
  rotated_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.pharma_webhook_secrets enable row level security;
-- No policy added — service role is the only writer + reader.

-- ============================================================
-- 3. courier_orders additions for pharma mirroring
-- ============================================================

-- external_ref: the pharma backend's order ID (internalReference from Neon).
-- Unique within vertical='pharma' via partial index. NULLable — restaurant
-- orders don't have this.
alter table public.courier_orders
  add column if not exists external_ref text;

-- Partial unique index: no two pharma mirror rows may share the same
-- pharma order ID. Lets ON CONFLICT handle idempotent inserts cleanly.
create unique index if not exists uq_courier_orders_pharma_external_ref
  on public.courier_orders (external_ref)
  where vertical = 'pharma' and external_ref is not null;

-- Fast lookup by external_ref when the Edge Function needs to UPDATE
-- an existing mirror row (status_changed / cancelled events).
create index if not exists idx_courier_orders_external_ref_pharma
  on public.courier_orders (external_ref)
  where vertical = 'pharma';

-- pharma_metadata: stores RX/ID-verification flags + total value without
-- adding dedicated columns to the main schema. Only populated for pharma
-- orders.
alter table public.courier_orders
  add column if not exists pharma_metadata jsonb;
