-- Migration: add deprecation comment to stripe_payment_intent_id column.
--
-- Stripe Connect is excluded from the active payment path per Iulian
-- directive 2026-05-16. This column is NOT dropped — existing rows may
-- reference historic Stripe intent IDs and we must preserve audit history.
-- The comment serves as an in-database signal that no new rows will use it.
--
-- Active PSP columns: netopia_payment_ref, viva_order_code (per-gateway).

COMMENT ON COLUMN orders.stripe_payment_intent_id IS
  'DEPRECATED 2026-05-16: Stripe Connect excluded from active payment path. '
  'Column retained for data-retention only. No new values written. '
  'See packages/integration-core/src/payment/_archived/NOTICE.md.';
