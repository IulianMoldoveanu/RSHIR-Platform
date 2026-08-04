-- Codex review (PR #1055, P2, round 7): every delivery permanently lost its
-- last leg.
--
-- Materialisation runs inside the AFTER UPDATE that stamps delivered_at, so at
-- that instant no GPS sample exists yet with recorded_at > the close — the
-- right-edge lookup added in 20260804_015 finds nothing. The stretch from the
-- last sample before the close to the doorstep is therefore omitted. And since
-- a closed order is only ever read from its stored columns, nothing revisits it
-- when the next ping lands 30 seconds later. The loss is permanent, systematic,
-- and always in the same direction: it under-reports the courier.
--
-- That is small per delivery (~one sampling interval of travel) and not small
-- in aggregate: twenty deliveries a day, every day, against a per_km_cents
-- payout, is a courier being quietly underpaid for distance they drove.
--
-- FIX: a cron that revisits recently-closed orders once a post-close sample
-- actually exists, and re-materialises them through the same guarded path.
--
-- It re-measures each order exactly ONCE. The predicate compares
-- route_computed_at against the FIRST sample after the close — the only one
-- that can become the right-edge neighbour. Before the revisit that sample is
-- newer than the computation, so the order is picked up; after it, the
-- computation is newer than the sample, and the order is never picked up
-- again no matter how long the courier keeps pinging.
--
-- The retention gate and the anti-downgrade guard (20260804_014) still apply:
-- this path cannot resurrect a purged window or overwrite a real measurement
-- with an empty one.

create or replace function public.fn_reclose_courier_order_routes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select co.id
      from public.courier_orders co
     where co.status in ('DELIVERED', 'CANCELLED')
       and co.assigned_courier_user_id is not null
       and co.route_computed_at is not null
       -- Only the recent past: an order closed hours ago has long since had
       -- its revisit, and the trail behind it is not going to improve.
       and coalesce(co.delivered_at, co.cancelled_at) >= now() - interval '2 hours'
       -- The first sample after the close arrived after we measured, so the
       -- measurement could not have seen it. NULL (no such sample yet) fails
       -- this comparison, which is the intended "nothing to add".
       and co.route_computed_at < (
         select min(p.recorded_at)
           from public.courier_location_pings p
          where p.courier_user_id = co.assigned_courier_user_id
            and p.recorded_at > coalesce(co.delivered_at, co.cancelled_at)
       )
     order by coalesce(co.delivered_at, co.cancelled_at) asc
     limit 200
  loop
    perform public.fn_materialise_courier_order_route(v_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.fn_reclose_courier_order_routes()
  from public, anon, authenticated, service_role;

comment on function public.fn_reclose_courier_order_routes() is
  'Re-measures orders closed in the last 2 hours whose final GPS sample landed '
  'after they were first measured, so the leg from the last sample to the '
  'doorstep is not lost. Self-terminating: each order qualifies exactly once. '
  'Runs every 5 minutes via pg_cron.';

create extension if not exists pg_cron;

do $$
declare
  existing_jobid bigint;
begin
  select jobid into existing_jobid
    from cron.job
   where jobname = 'courier-route-close-final-leg';

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'courier-route-close-final-leg',
  '*/5 * * * *',
  $$ select public.fn_reclose_courier_order_routes(); $$
);
