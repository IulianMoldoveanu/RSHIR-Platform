-- 20260630_037_courier_contact_rpc_no_phone_after_delivery.sql
-- ⚠️ REVIEW-READY — apply to prod via the Supabase Management API after staging.
-- Merging this file does NOT auto-apply it (this repo applies migrations manually).
--
-- Follow-up to 20260630_036 (GDPR pool-ingress Stage 1) — Codex P2.
-- The Stage-1 RPC returned customer_phone for status IN
--   ('ACCEPTED','PICKED_UP','IN_TRANSIT','DELIVERED')
-- but the live courier flows expose the customer phone ONLY while the delivery is
-- active and STOP after completion:
--   * apps/restaurant-courier/.../api/orders/[id]/masked-call/route.ts
--       CALLABLE = {'ACCEPTED','PICKED_UP','IN_TRANSIT'}
--   * apps/restaurant-courier/.../dashboard/orders/[id]/page.tsx
--       showQuickCall = ACCEPTED | PICKED_UP | IN_TRANSIT
-- Leaving DELIVERED in the RPC means that once Stages 2-3 route contact access
-- through it, any previously-assigned courier could recover a customer's phone
-- indefinitely after the order is complete — exactly the post-delivery PII
-- minimization this lane is meant to enforce. Align the RPC with the proven UI
-- rule: drop DELIVERED so contact is reveal-after-accept AND hide-after-deliver.
--
-- Idempotent (create or replace). Purely tightens the existing additive RPC; no
-- consumer is wired onto it yet (that is Stage 2), so this changes no live behaviour.

create or replace function public.get_courier_order_contact(p_order_id uuid)
returns table (customer_first_name text, customer_phone text)
language sql
stable
security definer
set search_path = ''
as $$
  -- ASSIGNED courier only, and ONLY while the delivery is active. Matches the
  -- masked-call CALLABLE set exactly; DELIVERED/CANCELLED return no contact.
  select co.customer_first_name, co.customer_phone
    from public.courier_orders co
   where co.id = p_order_id
     and co.assigned_courier_user_id = auth.uid()
     and co.status in ('ACCEPTED', 'PICKED_UP', 'IN_TRANSIT');
$$;

comment on function public.get_courier_order_contact(uuid) is
  'GDPR Stage 1: authorized customer-contact lookup for the ASSIGNED courier only, '
  'while the delivery is active (ACCEPTED/PICKED_UP/IN_TRANSIT). Mirrors the '
  'masked-call CALLABLE rule — reveal-after-accept, hide-after-deliver. Sole access '
  'path that Stages 2-3 migrate the courier app onto before customer_phone/'
  'first_name are removed from the shared pool.';

revoke all on function public.get_courier_order_contact(uuid) from public;
revoke all on function public.get_courier_order_contact(uuid) from anon;
grant execute on function public.get_courier_order_contact(uuid) to authenticated;
