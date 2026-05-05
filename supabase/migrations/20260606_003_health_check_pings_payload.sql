-- Lane HEALTHZ (2026-05-05): persist per-service breakdown in health probe history.
--
-- The new /api/healthz response shape (db / auth / storage / stripe) is more
-- detailed than the old { ok, db } shape. The Edge Function `health-monitor`
-- already records one row per probe in `health_check_pings`. Adding a `payload`
-- jsonb column lets the monitor store the full breakdown so the public /status
-- page can show "auth OK / DB slow" instead of a single green/red dot.
--
-- Additive only. Old rows keep `payload = null`. No code that reads the table
-- today depends on this column.

alter table public.health_check_pings
  add column if not exists payload jsonb;
