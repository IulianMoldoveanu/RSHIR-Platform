-- Lane F — Pharma courier callbacks (Option A: extend existing).
--
-- Adds three optional columns to courier_orders so the pharma producer side
-- can (a) declare cash-on-delivery amounts independent from total_ron and
-- (b) subscribe to outbound status callbacks per-order.
--
-- payment_method already exists from the original 20260428_001 scaffold
-- (text check in ('CARD','COD')). Not re-declared here.
--
-- Per-order callback secret (instead of a global one) lets pharma rotate
-- credentials without breaking history: old orders keep their old secret,
-- new orders get the freshly-rotated one. Same pattern as restaurant
-- webhook_secret added in 20260428_002.
--
-- All ALTERs are IF NOT EXISTS — re-applying this migration is a no-op.

alter table public.courier_orders
  add column if not exists cod_amount_ron numeric(10, 2);

alter table public.courier_orders
  add column if not exists pharma_callback_url text;

alter table public.courier_orders
  add column if not exists pharma_callback_secret text;

-- Optional partial index: lookups that drive the callback retry sweep
-- (a future Edge Function — same pattern as idx_courier_orders_pending_webhook
-- for the restaurant side). Cheap and additive.
create index if not exists idx_courier_orders_pharma_callback_pending
  on public.courier_orders (vertical, status)
  where vertical = 'pharma' and pharma_callback_url is not null;
