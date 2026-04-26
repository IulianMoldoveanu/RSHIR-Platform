-- Cash-on-delivery support (B9 from conversion research). Romanian
-- e-commerce buyers expect 'plată ramburs' as a peer of card payment.
-- Defaults to 'CARD' so the existing Stripe flow is the no-config path
-- and historical rows are unambiguous after backfill.
alter table restaurant_orders
  add column if not exists payment_method text not null default 'CARD'
  check (payment_method in ('CARD', 'COD'));

-- Index supports the admin orders queue filter "outstanding COD totals".
create index if not exists restaurant_orders_payment_method_idx
  on restaurant_orders (tenant_id, payment_method)
  where payment_method = 'COD';
