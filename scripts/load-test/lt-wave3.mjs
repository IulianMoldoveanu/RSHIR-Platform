// Wave 3 — a realistic Bucharest dinner rush.
//
// 50 couriers heartbeat like the PWA does, the sweep runs on its 1-minute
// cadence, couriers accept most offers and let some expire, and orders move
// through pickup and delivery. Measures whether the pool actually drains.
import { sql, table } from './lt-lib.mjs';

const TICKS = Number(process.env.TICKS || 12);   // simulated minutes
const ACCEPT_RATE = 0.85;

// Reset the world to a full pool, all orders ready and unassigned.
await sql(`
  update public.courier_orders
     set status='CREATED', assigned_courier_user_id=null, offer_expires_at=null,
         offered_at=null, accepted_at=null, picked_up_at=null, delivered_at=null,
         restaurant_ready_at=now(), created_at=now(), updated_at=now()
   where source_tenant_id in (select id from public.tenants where slug like 'lt-vendor-%');`);

const start = (await sql(`select count(*) as n from public.courier_orders where status='CREATED';`))[0].n;
console.log(`pool at start: ${start} orders, 50 couriers (cap 3 each -> 150 concurrent max)\n`);

const rows = [];
for (let tick = 1; tick <= TICKS; tick++) {
  const t0 = Date.now();

  // 1. every courier's app checks in (the PWA pings well inside 5 minutes)
  await sql(`update public.courier_shifts set last_seen_at = now() where status='ONLINE';`);

  // 2. the dispatcher tick
  const swept = await sql(`select public.fn_auto_dispatch_sweep() as offered;`);
  const sweepMs = Date.now() - t0;

  // 3. couriers respond: most accept, the rest let the offer lapse.
  //
  //    accepted_at is BACKDATED by one simulated minute per tick. The loop runs
  //    in seconds of wall time, so without this nothing ever crosses the
  //    pickup/delivery thresholds and work piles up until every courier hits
  //    their cap — which makes the pool look frozen for the wrong reason and
  //    turns any drain-time number into an artefact. Time has to move.
  await sql(`
    update public.courier_orders
       set status='ACCEPTED', accepted_at = now() - make_interval(mins => ${tick}), updated_at=now()
     where status='OFFERED'
       and md5(id::text || ${tick}) < ${`'${Math.floor(ACCEPT_RATE * 255).toString(16).padStart(2, '0')}'`} || repeat('f', 30);`);

  // 4. work in progress advances on a realistic Bucharest clock: ~4 minutes
  //    from accept to pickup, ~18 more to the door.
  await sql(`
    update public.courier_orders set status='PICKED_UP', picked_up_at=now(), updated_at=now()
     where status='ACCEPTED' and accepted_at < now() - interval '4 minutes';
    update public.courier_orders set status='DELIVERED', delivered_at=now(), updated_at=now()
     where status='PICKED_UP' and picked_up_at < now() - interval '18 minutes';`);

  // Deliveries need their pickup timestamp to age too, or nothing ever
  // completes and couriers never free up.
  await sql(`
    update public.courier_orders set picked_up_at = picked_up_at - interval '1 minute'
     where status='PICKED_UP';`);

  // 5. offers nobody answered go back to the pool (the real 1-minute cron)
  await sql(`select public.revoke_expired_courier_offers();`);

  const snap = (await sql(`
    select
      count(*) filter (where status='CREATED')   as pool,
      count(*) filter (where status='OFFERED')   as offered,
      count(*) filter (where status='ACCEPTED')  as accepted,
      count(*) filter (where status='PICKED_UP') as picked,
      count(*) filter (where status='DELIVERED') as delivered
      from public.courier_orders
     where source_tenant_id in (select id from public.tenants where slug like 'lt-vendor-%');`))[0];

  rows.push({ tick, sweep_offered: swept[0].offered, sweep_ms: sweepMs, ...snap });
  console.log(`tick ${String(tick).padStart(2)}  offered=${String(swept[0].offered).padStart(3)} (${String(sweepMs).padStart(4)}ms)  pool=${String(snap.pool).padStart(3)} offered=${String(snap.offered).padStart(3)} accepted=${String(snap.accepted).padStart(3)} picked=${String(snap.picked).padStart(3)} delivered=${String(snap.delivered).padStart(3)}`);
}

console.log('\n--- summary ---');
console.log(table(rows));

const last = rows[rows.length - 1];
const drained = Number(start) - Number(last.pool);
console.log(`\ndrained ${drained}/${start} in ${TICKS} simulated minutes`);
console.log(`peak sweep duration: ${Math.max(...rows.map((r) => r.sweep_ms))}ms`);
console.log(`mean offers per tick: ${(rows.reduce((a, r) => a + Number(r.sweep_offered), 0) / rows.length).toFixed(1)}`);

// Integrity checks that must hold no matter the load.
const bad = await sql(`
  select 'two live offers on one courier' as check, count(*) as n from (
    select assigned_courier_user_id from public.courier_orders
     where status='OFFERED' and assigned_courier_user_id is not null
     group by 1 having count(*) > 1) x
  union all
  select 'over parallel cap', count(*) from (
    select cp.user_id from public.courier_profiles cp
     where cp.max_parallel_orders is not null
       and (select count(*) from public.courier_orders o
             where o.assigned_courier_user_id=cp.user_id
               and o.status in ('ACCEPTED','PICKED_UP','IN_TRANSIT')) > cp.max_parallel_orders) y
  union all
  select 'assigned but not offered/accepted', count(*) from public.courier_orders
   where assigned_courier_user_id is not null and status='CREATED'
  union all
  select 'cross-fleet assignment', count(*) from public.courier_orders co
    join public.courier_profiles cp on cp.user_id = co.assigned_courier_user_id
   where co.assigned_courier_user_id is not null and cp.fleet_id <> co.fleet_id;`);
console.log('\n--- integrity ---');
console.log(table(bad));
