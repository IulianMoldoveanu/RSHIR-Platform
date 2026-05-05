-- HIR Courier — `courier_orders.cancellation_reason` (additive).
--
-- forceEndShiftAction (PR #238) cancels orders but the courier-cited reason
-- only lands in audit_log metadata. Admin / fleet-manager surfaces have no
-- way to show "courier cancelled — restaurant nu răspunde" inline without
-- opening the audit trail. Add a dedicated column so dispatchers see the
-- reason at a glance.
--
-- Strictly additive. No drop / rename. Backfill: NULL is fine for
-- pre-existing rows; the field is forward-only.

alter table public.courier_orders
  add column if not exists cancellation_reason text;

comment on column public.courier_orders.cancellation_reason is
  'Free-text reason captured at cancellation time (courier force-end-shift, vendor reject, customer cancellation, etc). Distinct from order_status_history which logs every transition. Length should stay under 500 chars; longer reasons are truncated by the writing action.';
