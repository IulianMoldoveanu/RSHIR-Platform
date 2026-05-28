-- Codify the COD-intake trigger that already exists on prod.
--
-- `trg_orders_notify_cod_intake` was created out-of-band on prod (some time
-- before 2026-05-27 — not via a checked-in migration). It fires the same
-- `notify_new_order_paid()` function as the legacy PAID-transition trigger,
-- but on INSERT when `payment_method='COD'`. Combined with the edge-function
-- branch added in the accompanying commit, this delivers the new-order email
-- for cash-on-delivery flows (which never transition payment_status to PAID
-- until the courier reports cash collected).
--
-- Idempotent: `drop trigger if exists` first so re-applying on a host where
-- the trigger is already present is a no-op.

drop trigger if exists trg_orders_notify_cod_intake on public.restaurant_orders;

create trigger trg_orders_notify_cod_intake
  after insert on public.restaurant_orders
  for each row
  when (new.payment_method = 'COD')
  execute function public.notify_new_order_paid();

comment on trigger trg_orders_notify_cod_intake on public.restaurant_orders is
  'Fires notify-new-order edge function on every COD order INSERT, so the '
  'restaurant owner gets the new-order email immediately (parallel to the '
  'PAID-transition trigger for card payments).';
