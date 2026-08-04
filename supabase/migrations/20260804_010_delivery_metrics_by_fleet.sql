-- HIR — platform delivery metrics, aggregated per fleet.
--
-- Feeds the Command Center analytics view. Aggregating in SQL rather than
-- pulling a month of orders into the page keeps the cost flat as volume grows.
--
-- Two totals, two meanings — see 20260804_009 for the full reasoning:
--   total_distance_m uses route_ATTRIBUTED_distance_m, because summing across
--     orders must not count a batched kilometre twice.
--   avg_distance_m uses route_distance_m, because "how long is a typical
--     delivery" is a question about what the courier actually drove.
--
-- measured_count vs delivered_count is the honesty column: it says how much of
-- the period we could actually measure. A fleet whose couriers deny location
-- permission shows a low ratio, and its averages should be read with that in
-- mind rather than trusted blindly.

create or replace function public.fn_delivery_metrics_by_fleet(p_days integer default 30)
returns table (
  fleet_id              uuid,
  fleet_name            text,
  delivered_count       bigint,
  measured_count        bigint,
  total_distance_m      bigint,
  avg_distance_m        integer,
  avg_pickup_distance_m integer,
  avg_total_seconds     integer,
  avg_to_pickup_seconds integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id,
         f.name,
         count(*),
         count(*) filter (
           where co.route_points >= 2 and co.route_distance_m is not null
         ),
         coalesce(sum(co.route_attributed_distance_m), 0)::bigint,
         -- avg() skips NULLs, so unmeasured deliveries do not drag the
         -- averages toward zero — they simply do not vote.
         round(avg(co.route_distance_m))::integer,
         round(avg(co.route_pickup_distance_m))::integer,
         round(avg(extract(epoch from (co.delivered_at - co.accepted_at))))::integer,
         round(avg(extract(epoch from (co.picked_up_at - co.accepted_at))))::integer
    from public.courier_orders co
    join public.courier_fleets f on f.id = co.fleet_id
   where co.status = 'DELIVERED'
     and co.delivered_at is not null
     and co.delivered_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
   group by f.id, f.name
   order by count(*) desc;
$$;

revoke execute on function public.fn_delivery_metrics_by_fleet(integer) from public, anon, authenticated;
grant execute on function public.fn_delivery_metrics_by_fleet(integer) to service_role;

comment on function public.fn_delivery_metrics_by_fleet(integer) is
  'Per-fleet delivery distance + duration aggregates over the last p_days '
  '(clamped 1..365). total_distance_m sums the attributed distance so batched '
  'kilometres are never counted twice; the averages use the real travelled '
  'distance. service_role only — Command Center analytics.';
