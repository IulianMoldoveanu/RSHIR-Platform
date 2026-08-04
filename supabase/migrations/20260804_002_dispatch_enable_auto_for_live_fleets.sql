-- Codex review (PR #1054, P1): pull dispatch (self-pickup) is removed in
-- this rollout, replaced by AUTOMAT (fn_auto_dispatch_sweep, migration
-- 20260630_038) or MANUAL (dispatcher assigns). But 20260630_038 gates
-- auto-dispatch OFF by default per fleet, and nobody had opted any fleet
-- in yet — verified live: `auto_dispatch_enabled` had zero TRUE rows.
-- Without this, any fleet whose couriers relied on self-pickup as their
-- day-to-day fallback (not just a human dispatcher watching /fleet) would
-- have orders sit unassigned in CREATED with no automatic path forward.
--
-- Fix: opt every currently-active fleet that has at least one courier into
-- AUTOMAT dispatch, so the moment self-pickup disappears, every live fleet
-- already has a working automatic fallback — not just whichever fleet a
-- human happens to remember to enable it for.
--
-- Requires 20260630_038 applied first (adds the auto_dispatch_enabled
-- column). Idempotent: re-running only (re-)sets TRUE on active fleets
-- with couriers, never turns a fleet back off (an operator's deliberate
-- OFF stays off on re-run only if they flip it back OFF before invoked —
-- this migration does not track "the operator turned it off on purpose"
-- separately from "it was never turned on", by design it's a one-time
-- rollout default, not a repeating enforcement).

update public.courier_fleets
set auto_dispatch_enabled = true
where is_active = true
  and auto_dispatch_enabled = false
  and id in (
    select distinct fleet_id
    from public.courier_profiles
    where fleet_id is not null
  );
