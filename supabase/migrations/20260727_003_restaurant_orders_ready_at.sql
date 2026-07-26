-- Stamps exactly when an order entered READY, so admin/KDS can compute
-- "how long has this pickup order been waiting for the customer" without
-- relying on updated_at (which any unrelated row touch would also bump,
-- making it an unreliable proxy for "time since last status change").
-- Needed for the no-show alert (pickup_noshow_alert_minutes setting).

alter table public.restaurant_orders
  add column if not exists ready_at timestamptz;

CREATE OR REPLACE FUNCTION public.stamp_restaurant_order_ready_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.status = 'READY' and (old.status is distinct from 'READY') then
    new.ready_at := now();
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_stamp_restaurant_order_ready_at on public.restaurant_orders;
create trigger trg_stamp_restaurant_order_ready_at
  before update on public.restaurant_orders
  for each row execute function public.stamp_restaurant_order_ready_at();
