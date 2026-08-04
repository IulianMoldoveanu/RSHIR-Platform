-- Codex review (PR #1054, P1 — first pass): pull dispatch (self-pickup) is
-- removed in this rollout, replaced by AUTOMAT (fn_auto_dispatch_sweep,
-- migration 20260630_038) or MANUAL (dispatcher assigns). But 20260630_038
-- gates auto-dispatch OFF by default per fleet, and nobody had opted any
-- fleet in yet — verified live: `auto_dispatch_enabled` had zero TRUE rows.
-- Without this, couriers relying on self-pickup as their day-to-day
-- fallback (not just a human dispatcher watching /fleet) would have orders
-- sit unassigned in CREATED with no automatic path forward.
--
-- Codex review, SECOND pass: the first version of this migration enabled
-- auto-dispatch for EVERY active fleet with a courier — including
-- third-party managed fleets (e.g. "Els courier delivery srl") that have
-- their own owner_user_id and never relied on the open pool; they run
-- their own dispatch (own app or manual, per setFleetAutoDispatchAction's
-- own framing: "I allocate, or I hand the fleet off"). Force-enabling HIR's
-- sweep for them would push HIR-directed offers alongside whatever their
-- own process already does — an unrequested behavior change for a
-- fleet that isn't broken by this rollout.
--
-- Scope narrowed to the platform's own unmanaged default bucket only
-- (slug 'hir-default') — the one fleet couriers land in with no genuine
-- third-party operator, and therefore the only one that actually loses its
-- allocation mechanism when self-pickup disappears.
--
-- Requires 20260630_038 applied first (adds the auto_dispatch_enabled
-- column). Idempotent.

update public.courier_fleets
set auto_dispatch_enabled = true
where slug = 'hir-default'
  and is_active = true;
