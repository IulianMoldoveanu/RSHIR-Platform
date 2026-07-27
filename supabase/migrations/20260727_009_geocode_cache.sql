-- Persistent geocode cache — replaces the in-memory LRU in
-- /api/checkout/geocode. On Vercel, each serverless instance runs its own
-- process, so the in-memory cache only helps within a single warm
-- instance; a burst of checkouts spread across instances re-geocodes the
-- SAME address repeatedly against Nominatim's 1 req/sec global budget.
-- A shared table means "this street was geocoded once, anywhere" holds
-- platform-wide, which matters most at volume (Delivery House launching
-- with hundreds of orders/day from day one) and for a 24/7 kitchen where
-- the same handful of neighborhoods repeat constantly.
--
-- No RLS needed — service-role only (the route already uses the admin
-- client), never queried from the browser.

create table if not exists public.geocode_cache (
  cache_key text primary key,
  lat double precision not null,
  lng double precision not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- Cache entries are treated as stale after 24h (same TTL as the old
-- in-memory cache) — cleanup is opportunistic via a WHERE clause at read
-- time, not a cron; a slowly-growing table of short text rows is cheap
-- enough that a dedicated sweep job isn't worth it yet.
create index if not exists idx_geocode_cache_created_at
  on public.geocode_cache (created_at);
