-- 20260630_036_courier_contact_rpc.sql
-- ⚠️ REVIEW-READY — apply to prod via the Supabase Management API after staging.
--
-- GDPR pool-ingress hardening — STAGE 1 of 3 (audit board, HIR-ECOSYSTEM-AUDIT-2026-06-18).
-- The shared courier_orders pool stores customer_first_name + customer_phone in
-- plaintext. RLS already gates courier *access* (20260505_007), but the long-term
-- fix is to move the real contact out of the shared pool (hash in courier_orders,
-- real value via this RPC from the per-tenant source) so service-role/backup no
-- longer see plaintext PII alongside pharma (Art.9) rows.
--
-- This migration is PURELY ADDITIVE and changes nothing existing: it introduces the
-- single authorized access path that Stages 2-3 will migrate the ~65 current
-- consumers onto, BEFORE the column is ever hashed. Mirrors the proven auth rule in
-- apps/restaurant-courier/.../masked-call/route.ts — the ASSIGNED courier only,
-- post-accept. Open/offered/cancelled orders return no contact (reveal-after-accept).
--
-- Idempotent (create or replace).

create or replace function public.get_courier_order_contact(p_order_id uuid)
returns table (customer_first_name text, customer_phone text)
language sql
stable
security definer
set search_path = ''
as $$
  -- SECURITY DEFINER + explicit assignee check = the function returns contact ONLY
  -- for an order assigned to the calling courier, regardless of how column-level
  -- access is locked down later. auth.uid() is schema-qualified for search_path=''.
  select co.customer_first_name, co.customer_phone
    from public.courier_orders co
   where co.id = p_order_id
     and co.assigned_courier_user_id = auth.uid()
     and co.status in ('ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED');
$$;

comment on function public.get_courier_order_contact(uuid) is
  'GDPR Stage 1: authorized customer-contact lookup for the ASSIGNED courier only '
  '(post-accept). Sole access path that Stages 2-3 migrate the courier app onto '
  'before customer_phone/first_name are removed from the shared pool. '
  'Fleet-manager contact access is handled separately in Stage 2.';

revoke all on function public.get_courier_order_contact(uuid) from public;
revoke all on function public.get_courier_order_contact(uuid) from anon;
grant execute on function public.get_courier_order_contact(uuid) to authenticated;
