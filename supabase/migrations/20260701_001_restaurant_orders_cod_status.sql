-- Add cod_status column to restaurant_orders.
--
-- Tracks the cash-on-delivery collection outcome reported by the courier.
-- Three states:
--   NULL                  — order is not COD or courier has not yet delivered
--   CONFIRMED_BY_COURIER  — courier tapped "Da, am încasat" and reported cash collected
--   PENDING_ADMIN_REVIEW  — courier tapped "Nu" (did not collect cash); admin must
--                           follow up and manually mark payment_status = PAID
--
-- Idempotent: uses ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
-- The CHECK constraint mirrors the set above; NULL is allowed for non-COD rows.

alter table public.restaurant_orders
  add column if not exists cod_status text
    check (cod_status in ('CONFIRMED_BY_COURIER', 'PENDING_ADMIN_REVIEW'));

comment on column public.restaurant_orders.cod_status is
  'Cash-on-delivery collection outcome reported by the courier. '
  'NULL = not applicable or not yet reported. '
  'CONFIRMED_BY_COURIER = courier confirmed cash collected; payment_status auto-set to PAID. '
  'PENDING_ADMIN_REVIEW = courier reported cash not collected; admin must follow up.';
