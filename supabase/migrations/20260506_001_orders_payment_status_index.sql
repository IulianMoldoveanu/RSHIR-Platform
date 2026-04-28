-- Composite index for the admin "Cash neîncasat" filter and any other
-- (tenant_id, payment_status) lookups (KPI cards, COD reconciliation
-- panel). The pre-existing partial index on payment_method='COD' alone
-- can't serve a payment_status filter; without this index the queue
-- query falls back to a sequential scan on every render.
create index if not exists restaurant_orders_tenant_payment_status_idx
  on public.restaurant_orders (tenant_id, payment_status);
