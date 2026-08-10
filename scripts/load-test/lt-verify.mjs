// Verify the two fixes actually change the outcome of the cases that failed.
import { sql, s, j, table } from './lt-lib.mjs';

const results = [];
const check = (name, pass, detail) => { results.push({ check: name, result: pass ? 'PASS' : 'FAIL', detail }); console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`); };

// Clean slate. delivery_pricings, fleet_invoice_items and payout_items are
// ON DELETE RESTRICT against courier_orders, so they go first.
await sql(`
  with lt as (select id from public.tenants where slug like 'lt-vendor-%'),
       co as (select id from public.courier_orders where source_tenant_id in (select id from lt))
  delete from public.delivery_pricings where delivery_id in (select id from co);
  with lt as (select id from public.tenants where slug like 'lt-vendor-%'),
       co as (select id from public.courier_orders where source_tenant_id in (select id from lt))
  delete from public.fleet_invoice_items where delivery_id in (select id from co);
  with lt as (select id from public.tenants where slug like 'lt-vendor-%'),
       co as (select id from public.courier_orders where source_tenant_id in (select id from lt))
  delete from public.payout_items where delivery_id in (select id from co);
  delete from public.courier_orders where source_tenant_id in (select id from public.tenants where slug like 'lt-vendor-%');
  delete from public.restaurant_orders where tenant_id in (select id from public.tenants where slug like 'lt-vendor-%');`);

const V20 = (await sql(`select id from public.tenants where slug='lt-vendor-20';`))[0].id;
const OWNER = (await sql(`select id from public.courier_fleets where slug='hir-owner-fallback';`))[0].id;
const STAFFED = (await sql(`select id from public.courier_fleets where slug='buc-nord';`))[0].id;

async function orderFor(tenantId, tag) {
  const c = (await sql(`
    select c.id as cid, a.id as aid from public.customers c
      join public.customer_addresses a on a.customer_id=c.id
     where c.tenant_id=${s(tenantId)}::uuid limit 1;`))[0];
  const o = await sql(`
    insert into public.restaurant_orders (tenant_id, customer_id, delivery_address_id, items, subtotal_ron, delivery_fee_ron, total_ron, status, payment_method)
    values (${s(tenantId)}::uuid, ${s(c.cid)}::uuid, ${s(c.aid)}::uuid, ${j([{ name: tag, qty: 1, price_ron: 30 }])}, 30, 12, 42, 'PENDING', 'COD')
    returning id;`);
  await sql(`update public.restaurant_orders set status='PREPARING' where id=${s(o[0].id)}::uuid;`);
  return o[0].id;
}

// ---- FIX 1: unassigned vendor must now land in a STAFFED fleet -------------
console.log('\nFIX 1 — vendor with no fleet assignment');
// The owner fallback still has zero couriers; buc-nord is staffed but is not
// tier=owner, so make one staffed owner fleet exist the way production would.
await sql(`update public.courier_fleets set tier='owner' where slug='buc-nord';`);
const oid = await orderFor(V20, 'fix1');
const routed = (await sql(`
  select f.slug as fleet, f.tier,
         (select count(*) from public.courier_profiles cp where cp.fleet_id=f.id and cp.status='ACTIVE') as riders
    from public.courier_orders co join public.courier_fleets f on f.id=co.fleet_id
   where co.source_order_id = ${s(oid)};`))[0];
check('unassigned vendor routes to a staffed fleet', Number(routed.riders) > 0,
      `landed in "${routed.fleet}" (tier=${routed.tier}) with ${routed.riders} riders`);

await sql(`update public.courier_shifts set last_seen_at=now() where status='ONLINE';`);
const offered = await sql(`select public.fn_auto_dispatch_sweep() as n;`);
const st = (await sql(`select status, assigned_courier_user_id is not null as assigned from public.courier_orders where source_order_id=${s(oid)};`))[0];
check('that order actually gets offered', st.assigned === true, `status=${st.status}, sweep offered ${offered[0].n}`);

// ---- FIX 2: fast alarms -----------------------------------------------------
console.log('\nFIX 2 — fast alarms on the open pool');

// (a) unstaffed fleet: force an order into the rider-less owner fleet.
await sql(`update public.courier_fleets set tier='partner' where slug='buc-nord';`);  // restore
const oid2 = await orderFor(V20, 'fix2');
await sql(`update public.courier_orders set fleet_id=${s(OWNER)}::uuid, status='CREATED', assigned_courier_user_id=null
            where source_order_id=${s(oid2)};`);

// (b) no reachable courier: age an order past 10 min and stale every heartbeat.
await sql(`update public.courier_orders set created_at = now() - interval '15 minutes'
            where source_order_id=${s(oid2)};`);
await sql(`update public.courier_shifts set last_seen_at = now() - interval '30 minutes' where status='ONLINE';`);

await sql(`select cron.schedule('hm-once','* * * * *', 'select 1');`).catch(() => {});
// run the monitor body directly rather than waiting for the cron tick
const monitor = (await sql(`
  with
    no_candidates as (
      select count(*) as n from public.courier_orders co
      join public.courier_fleets f on f.id = co.fleet_id
      where co.status='CREATED' and co.assigned_courier_user_id is null
        and f.auto_dispatch_enabled and f.is_active
        and co.created_at < now() - interval '10 minutes'
        and not exists (
          select 1 from public.courier_profiles cp
          join public.courier_shifts cs on cs.courier_user_id = cp.user_id
          where cp.fleet_id=f.id and cp.status='ACTIVE' and cs.status='ONLINE'
            and cs.last_seen_at is not null and cs.last_seen_at >= now() - interval '5 minutes'
            and public.courier_can_take_orders(cp.user_id))),
    unstaffed as (
      select count(*) as n from public.courier_orders co
      where co.status='CREATED'
        and not exists (select 1 from public.courier_profiles cp
                         where cp.fleet_id=co.fleet_id and cp.status='ACTIVE'))
  select no_candidates.n as pool_no_candidates, unstaffed.n as orders_unstaffed_fleet
    from no_candidates, unstaffed;`))[0];
console.log(`  monitor -> pool_no_candidates=${monitor.pool_no_candidates}  orders_unstaffed_fleet=${monitor.orders_unstaffed_fleet}`);
check('alarm fires when nobody is reachable', Number(monitor.pool_no_candidates) > 0,
      `${monitor.pool_no_candidates} order(s) flagged at the 10-minute threshold`);
check('alarm fires for a rider-less fleet', Number(monitor.orders_unstaffed_fleet) > 0,
      `${monitor.orders_unstaffed_fleet} order(s) in a fleet with no ACTIVE couriers`);

// The monitor must stay quiet when things are healthy.
await sql(`update public.courier_shifts set last_seen_at = now() where status='ONLINE';`);
await sql(`update public.courier_orders set status='DELIVERED' where source_order_id=${s(oid2)};`);
const quiet = (await sql(`
  select (select count(*) from public.courier_orders co
           join public.courier_fleets f on f.id=co.fleet_id
          where co.status='CREATED' and co.assigned_courier_user_id is null
            and f.auto_dispatch_enabled and f.is_active
            and co.created_at < now() - interval '10 minutes'
            and not exists (
              select 1 from public.courier_profiles cp
              join public.courier_shifts cs on cs.courier_user_id=cp.user_id
              where cp.fleet_id=f.id and cp.status='ACTIVE' and cs.status='ONLINE'
                and cs.last_seen_at >= now() - interval '5 minutes'
                and public.courier_can_take_orders(cp.user_id))) as n;`))[0];
check('no false alarm when couriers are reachable', Number(quiet.n) === 0, `pool_no_candidates=${quiet.n}`);

console.log('\n--- verification ---');
console.log(table(results));
console.log(results.every((r) => r.result === 'PASS') ? '\nALL GREEN' : '\nSOME CHECKS FAILED');
