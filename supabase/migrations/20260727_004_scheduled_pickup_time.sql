-- Scheduled pickup time — customer picks "ASAP" or a specific 15-min slot
-- in the next few hours for a PICKUP (not delivery) order. Simple dropdown,
-- no restaurant-hours validation (Delivery House is 24/7 fast-food, so
-- there's no closing time to validate against). Distinct from the existing
-- is_pre_order/scheduled_for pair, which is a different product (advance
-- catering bookings, manually confirmed by phone) — this is same-day,
-- automatic, normal checkout.

alter table public.restaurant_orders
  add column if not exists scheduled_pickup_at timestamptz;

comment on column public.restaurant_orders.scheduled_pickup_at is
  'Customer-selected pickup time for a same-day PICKUP order (null = ASAP). Distinct from scheduled_for, which is the advance-booking pre-order flow.';
