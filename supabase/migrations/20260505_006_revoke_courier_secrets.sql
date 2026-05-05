-- HIR Courier — column-level REVOKE on webhook + pharma callback secrets.
--
-- Security audit (2026-05-05) finding P1 #9: courier_orders has wide RLS
-- letting any authenticated rider in the fleet SELECT the row, including
-- webhook_secret + pharma_callback_secret. A malicious rider could harvest
-- those secrets and forge `order.status_changed` POSTs to subscribers
-- (the secret is the only auth on the receiver side).
--
-- This migration plugs the hole at the column-grant layer: RLS still lets
-- the row through, but the secret columns return NULL for any role that
-- isn't service_role. Same defense-in-depth pattern as the existing REVOKE
-- on courier_orders.manager_note (PR #156).
--
-- Idempotent.

revoke select (webhook_secret) on public.courier_orders from authenticated, anon;
revoke select (pharma_callback_secret) on public.courier_orders from authenticated, anon;

comment on column public.courier_orders.webhook_secret is
  'Per-order webhook HMAC secret. Service-role only (column-level REVOKE 20260505_006). Forged callbacks attempt would otherwise be possible from any fleet courier.';
comment on column public.courier_orders.pharma_callback_secret is
  'Per-order pharma callback HMAC secret. Service-role only (column-level REVOKE 20260505_006).';
