-- HIR Courier — narrow courier_orders SELECT RLS (audit §3.3, P1).
--
-- Today: 3 SELECT policies on courier_orders that grant access via OR:
--   * courier_orders_courier_read  — fleet+vertical match (any fleet courier sees ALL fleet orders)
--   * courier_orders_self_read     — fleet match (any fleet courier sees ALL fleet orders)
--   * courier_orders_assignee_or_offered_select — assignee OR open-CREATED/OFFERED (the one we want)
--
-- The first two let any malicious rider in a fleet SELECT customer_phone,
-- dropoff_line1, cod_amount_ron, pharma_metadata for every order in their
-- fleet — a privacy leak. They were intended to power the orders-list +
-- detail pages, but those routes use the service-role admin client (bypass
-- RLS), so dropping them does not break server-rendered surfaces.
--
-- The realtime subscription (orders-realtime.tsx) uses anon-key + filters
-- on assigned_courier_user_id=eq.<self>, so it's already self-scoped.
-- After this migration the filter is enforced at the row level too.
--
-- Also strengthens the kept policy: open-orders visibility now requires
-- the order's fleet_id to match the courier's fleet, so a rider in
-- fleet A cannot see fleet B's open orders.
--
-- Idempotent. Reversible by reapplying the dropped policies if needed.

drop policy if exists "courier_orders_courier_read" on public.courier_orders;
drop policy if exists "courier_orders_self_read" on public.courier_orders;
drop policy if exists "courier_orders_assignee_or_offered_select" on public.courier_orders;

create policy "courier_orders_assignee_or_open_select"
  on public.courier_orders
  for select
  to authenticated
  using (
    assigned_courier_user_id = auth.uid()
    or (
      assigned_courier_user_id is null
      and status in ('CREATED', 'OFFERED')
      and fleet_id in (
        select fleet_id from public.courier_profiles where user_id = auth.uid()
      )
    )
  );

comment on policy "courier_orders_assignee_or_open_select" on public.courier_orders is
  'Audit §3.3 narrowed (2026-05-05): courier sees their assigned orders + open orders within their own fleet. Server-rendered surfaces use service-role admin client and bypass this policy. Replaces the wider courier_read + self_read policies that exposed all fleet PII.';
