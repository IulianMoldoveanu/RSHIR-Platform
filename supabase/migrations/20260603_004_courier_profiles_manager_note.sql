-- Manager-only free-text note on a courier profile. Used by the fleet
-- dashboard's courier detail page to record context the manager wants
-- to remember (e.g. "speaks German", "prefers night shifts", "vehicle
-- repaired 2026-04-30 — do not assign heavy orders this week").
--
-- Intentionally NOT shown to the courier themselves. Read access from
-- the rider app is OK because RLS on courier_profiles already gates
-- per-user reads, but the rider UI never queries this column.
--
-- Additive change: nullable text, no default. Existing rows pick up NULL.
-- Already applied to prod via Supabase Management API on 2026-05-04
-- before this migration file landed.

alter table public.courier_profiles
  add column if not exists manager_note text;

comment on column public.courier_profiles.manager_note is
  'Fleet-manager-only free-text note. Never displayed to the rider.';
