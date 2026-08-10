-- ============================================================================
-- The stranded order nobody was told about.
--
-- Found by simulation, 2026-08-10: place an order for a tenant with no fleet
-- assignment, and the bridge does exactly what it is written to do — falls
-- down the ladder (assignment -> owner fleet WITH riders -> any owner fleet)
-- and lands on an owner fleet with zero active couriers. The courier job is
-- created, no rider can be offered it, and it sits in CREATED indefinitely.
--
-- Nothing alerts on that. `dispatched_unpicked_over_5m` counts
-- restaurant_orders.status='DISPATCHED', but a stranded order NEVER REACHES
-- DISPATCHED — the bridge fires at PREPARING and the restaurant order stays in
-- a kitchen state precisely because no courier ever picks it up. So the one
-- alert that eventually fires is `kitchen_overdue_over_15m`, which tells the
-- restaurant its kitchen is slow when the truth is that the platform has
-- nobody to send.
--
-- Wrong alert, wrong owner, five minutes later than it should be.
--
-- Live exposure at the time of writing: 3 of 4 active tenants (FOISORUL A,
-- Restaurantul Demo, HIR Test Restaurant Bucuresti) have no
-- fleet_restaurant_assignments row, and the only tier='owner' fleet has zero
-- ACTIVE couriers. Every order they take today lands in that hole.
--
-- This adds the metric that sees the real state — a courier job nobody has
-- taken — reported per tenant, with the fleet that is holding it, and fires at
-- 10 minutes so it lands BEFORE the kitchen gets blamed at 15.
-- ============================================================================

create or replace view public.live_ops_telemetry with (security_invoker = on) as
 WITH active_orders AS (
         SELECT o.tenant_id,
            count(*) FILTER (WHERE o.status = ANY (ARRAY['PENDING'::text, 'CONFIRMED'::text, 'PREPARING'::text, 'READY'::text])) AS kitchen_queue,
            count(*) FILTER (WHERE o.status = ANY (ARRAY['DISPATCHED'::text, 'IN_DELIVERY'::text])) AS in_courier_flow,
            count(*) FILTER (WHERE o.status = 'DISPATCHED'::text AND o.updated_at < (now() - '00:05:00'::interval)) AS dispatched_unpicked_over_5m,
            count(*) FILTER (WHERE (o.status = ANY (ARRAY['PENDING'::text, 'CONFIRMED'::text, 'PREPARING'::text, 'READY'::text])) AND o.created_at < (now() - '00:15:00'::interval)) AS kitchen_overdue_over_15m,
            max(o.created_at) AS last_order_at
           FROM restaurant_orders o
          WHERE o.created_at >= (now() - '24:00:00'::interval)
          GROUP BY o.tenant_id
        ), recent_revenue AS (
         SELECT restaurant_orders.tenant_id,
            COALESCE(sum(restaurant_orders.total_ron), 0::numeric) AS revenue_24h_ron,
            count(*) AS delivered_24h
           FROM restaurant_orders
          WHERE restaurant_orders.status = 'DELIVERED'::text AND restaurant_orders.updated_at >= (now() - '24:00:00'::interval)
          GROUP BY restaurant_orders.tenant_id
        ), unclaimed AS (
         -- A courier job still in the pool, or offered and unanswered, more
         -- than ten minutes after it was created. OFFERED counts: an offer
         -- that keeps expiring and re-offering is not progress, and the order
         -- is just as undelivered.
         SELECT co.source_tenant_id AS tenant_id,
            count(*) AS courier_unclaimed_over_10m,
            (max(EXTRACT(epoch FROM (now() - co.created_at))) / 60::numeric)::integer AS courier_unclaimed_oldest_min,
            (array_agg(COALESCE(f.name, '(fără flotă)') ORDER BY co.created_at))[1] AS courier_unclaimed_fleet,
            -- Zero riders means no amount of waiting will help: this is a
            -- routing failure, not a busy night. It changes who gets paged.
            bool_or(NOT EXISTS (
              SELECT 1 FROM courier_profiles cp
               WHERE cp.fleet_id = co.fleet_id AND cp.status = 'ACTIVE'
            )) AS courier_unclaimed_fleet_unstaffed
           FROM courier_orders co
             LEFT JOIN courier_fleets f ON f.id = co.fleet_id
          WHERE co.source_type = 'HIR_TENANT'
            AND co.source_tenant_id IS NOT NULL
            AND co.status = ANY (ARRAY['CREATED'::text, 'OFFERED'::text])
            AND co.created_at >= (now() - '24:00:00'::interval)
            AND co.created_at < (now() - '00:10:00'::interval)
          GROUP BY co.source_tenant_id
        )
 SELECT t.id AS tenant_id,
    t.name AS tenant_name,
    t.slug AS tenant_slug,
    t.city_id,
    t.delivery_mode,
    COALESCE(a.kitchen_queue, 0::bigint) AS kitchen_queue,
    COALESCE(a.in_courier_flow, 0::bigint) AS in_courier_flow,
    COALESCE(a.dispatched_unpicked_over_5m, 0::bigint) AS dispatched_unpicked_over_5m,
    COALESCE(a.kitchen_overdue_over_15m, 0::bigint) AS kitchen_overdue_over_15m,
    a.last_order_at,
    COALESCE(r.delivered_24h, 0::bigint) AS delivered_24h,
    COALESCE(r.revenue_24h_ron, 0::numeric)::numeric(12,2) AS revenue_24h_ron,
    COALESCE(u.courier_unclaimed_over_10m, 0::bigint) AS courier_unclaimed_over_10m,
    u.courier_unclaimed_oldest_min,
    u.courier_unclaimed_fleet,
    COALESCE(u.courier_unclaimed_fleet_unstaffed, false) AS courier_unclaimed_fleet_unstaffed
   FROM tenants t
     LEFT JOIN active_orders a ON a.tenant_id = t.id
     LEFT JOIN recent_revenue r ON r.tenant_id = t.id
     LEFT JOIN unclaimed u ON u.tenant_id = t.id
  WHERE t.status = 'ACTIVE'::text;

comment on view public.live_ops_telemetry is
  'Per-tenant live operations counters for ops-alerts-tick. '
  'courier_unclaimed_over_10m counts courier jobs nobody has taken — the '
  'stranded state that never reaches DISPATCHED and so is invisible to '
  'dispatched_unpicked_over_5m. courier_unclaimed_fleet_unstaffed separates '
  '"the fleet is busy" from "the fleet has no riders at all", which are two '
  'different problems for two different people.';
