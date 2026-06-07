-- Pharmacist-ready signal on the shared courier pool.
--
-- A pharma order can be allocated to and accepted by a courier BEFORE the
-- pharmacist finishes preparing it (Model Y: the courier heads to the pharmacy
-- and waits there). Pickup must stay blocked until the pharmacist marks the
-- order "ready for pickup". The courier-mirror-pharma edge function stamps this
-- column when it receives a READY_FOR_PICKUP status_changed event, independent
-- of the dispatch status (CREATED / OFFERED / ACCEPTED). markPickedUpAction
-- blocks pharma pickup while it is NULL, and the courier home shows a
-- "waiting for the pharmacy" state instead of the pickup swipe.
alter table public.courier_orders
  add column if not exists pharma_ready_at timestamptz;

comment on column public.courier_orders.pharma_ready_at is
  'When the pharmacist marked the order ready for pickup (mirrored from pharma READY_FOR_PICKUP). NULL = not yet ready; gates courier pickup for vertical=pharma.';
