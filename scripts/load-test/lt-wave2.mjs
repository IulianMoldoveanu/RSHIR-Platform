// Wave 2 — contention, throughput, caps and tenant isolation.
import { sql, trySql, s, j, table } from './lt-lib.mjs';

const findings = [];
const note = (sev, what, detail) => { findings.push({ sev, what, detail: String(detail).slice(0, 180) }); console.log(`  [${sev}] ${what} — ${detail}`); };

// ================================================================= A
console.log('\nA. atomic claim: 12 couriers race for the SAME order');
await sql(`
  update public.courier_orders set status='CREATED', assigned_courier_user_id=null, offer_expires_at=null
   where source_tenant_id in (select id from public.tenants where slug like 'lt-vendor-%');`);
const one = (await sql(`
  select co.id, co.fleet_id from public.courier_orders co
   join public.tenants t on t.id = co.source_tenant_id
   where t.slug='lt-vendor-2' limit 1;`))[0];
const racers = await sql(`
  select user_id from public.courier_profiles
   where fleet_id = ${s(one.fleet_id)}::uuid and status='ACTIVE' limit 12;`);
const raceResults = await Promise.all(racers.map((c) =>
  trySql(`select public.offer_courier_order(${s(one.id)}::uuid, ${s(c.user_id)}::uuid, ${s(one.fleet_id)}::uuid, 90) as r;`)));
const won = raceResults.filter((r) => r.ok && r.rows[0]?.r?.offered === true).length;
const lost = raceResults.filter((r) => r.ok && r.rows[0]?.r?.offered === false).length;
const errored = raceResults.filter((r) => !r.ok).length;
console.log(`   winners=${won} losers=${lost} errors=${errored} (of ${racers.length})`);
if (won !== 1) note('BUG', 'atomic offer claim broken', `${won} concurrent callers won the same order`);
else console.log('   exactly one winner ✓');

// ================================================================= B
console.log('\nB. two couriers accept the same OFFERED order at once');
const offered = (await sql(`
  select id, assigned_courier_user_id, fleet_id from public.courier_orders
   where status='OFFERED' limit 1;`))[0];
if (offered) {
  const other = (await sql(`
    select user_id from public.courier_profiles
     where fleet_id=${s(offered.fleet_id)}::uuid and status='ACTIVE'
       and user_id <> ${s(offered.assigned_courier_user_id)}::uuid limit 1;`))[0];
  const accept = (uid) => trySql(`
    update public.courier_orders
       set status='ACCEPTED', accepted_at=now(), assigned_courier_user_id=${s(uid)}::uuid, updated_at=now()
     where id=${s(offered.id)}::uuid and status='OFFERED'
    returning id;`);
  const [r1, r2] = await Promise.all([accept(offered.assigned_courier_user_id), accept(other.user_id)]);
  const wins = [r1, r2].filter((r) => r.ok && r.rows.length > 0).length;
  console.log(`   accepts that landed: ${wins}`);
  if (wins !== 1) note('BUG', 'double-accept possible', `${wins} concurrent accepts both succeeded`);
  else console.log('   exactly one accept landed ✓');
}

// ================================================================= C
console.log('\nC. max_parallel_orders cap (3) is respected by the sweep');
const cap = (await sql(`
  select cp.user_id, cp.max_parallel_orders,
         (select count(*) from public.courier_orders o
           where o.assigned_courier_user_id = cp.user_id
             and o.status in ('ACCEPTED','PICKED_UP','IN_TRANSIT')) as active
    from public.courier_profiles cp
   where cp.phone like '+4079900%'
   order by active desc limit 5;`));
console.log(table(cap));
const over = cap.filter((c) => Number(c.active) > Number(c.max_parallel_orders));
if (over.length) note('BUG', 'courier over the parallel cap', JSON.stringify(over));
else console.log('   nobody over cap ✓');

// ================================================================= D
console.log('\nD. throughput: fill the pool with 300 ready orders and sweep');
const tenants = await sql(`select id from public.tenants where slug like 'lt-vendor-%' and slug <> 'lt-vendor-20';`);
const bulk = [];
for (let i = 0; i < 300; i++) {
  const t = tenants[i % tenants.length].id;
  bulk.push(`insert into public.restaurant_orders (tenant_id, customer_id, delivery_address_id, items, subtotal_ron, delivery_fee_ron, total_ron, status, payment_method)
    select ${s(t)}::uuid, c.id, a.id, ${j([{ name: 'x', qty: 1, price_ron: 30 }])}, 30, 12, 42, 'PENDING', 'COD'
      from public.customers c join public.customer_addresses a on a.customer_id=c.id
     where c.tenant_id=${s(t)}::uuid order by md5(c.id::text||${s(String(i))}) limit 1;`);
}
const tBulk = Date.now();
for (let i = 0; i < bulk.length; i += 50) await sql(bulk.slice(i, i + 50).join('\n'));
console.log(`   300 orders inserted in ${Date.now() - tBulk}ms`);

const tPrep = Date.now();
await sql(`update public.restaurant_orders set status='PREPARING'
            where status='PENDING' and tenant_id in (select id from public.tenants where slug like 'lt-vendor-%');`);
console.log(`   bulk PENDING->PREPARING (fires the trigger 300x) in ${Date.now() - tPrep}ms`);
await sql(`update public.restaurant_orders set status='READY'
            where status='PREPARING' and tenant_id in (select id from public.tenants where slug like 'lt-vendor-%');`);

const pool = await sql(`
  select count(*) as open_pool from public.courier_orders
   where status='CREATED' and assigned_courier_user_id is null;`);
console.log(`   open pool: ${pool[0].open_pool}`);

const ticks = [];
for (let k = 0; k < 3; k++) {
  const t0 = Date.now();
  const r = await sql(`select public.fn_auto_dispatch_sweep() as offered;`);
  ticks.push({ tick: k + 1, offered: r[0].offered, ms: Date.now() - t0 });
}
console.log(table(ticks));
const stillOpen = (await sql(`select count(*) as n from public.courier_orders where status='CREATED' and assigned_courier_user_id is null;`))[0].n;
console.log(`   still open after 3 ticks: ${stillOpen}`);
note('INFO', 'dispatch throughput', `sweep is capped at 50 orders/tick and runs 1x/min -> ${stillOpen} orders still waiting; drain time ~${Math.ceil(Number(stillOpen) / 50)} more minutes at best`);

// ================================================================= E
console.log('\nE. tenant isolation under RLS');
const [tA, tB] = await sql(`select id, slug from public.tenants where slug like 'lt-vendor-%' order by slug limit 2;`);
const iso = await trySql(`
  set local role authenticated;
  select set_config('request.jwt.claims', ${s(JSON.stringify({ sub: '00000000-0000-0000-0000-0000000000aa', role: 'authenticated' }))}, true);
  select count(*) as visible_orders from public.restaurant_orders;`);
if (iso.ok) {
  const v = iso.rows[0]?.visible_orders ?? iso.rows?.visible_orders;
  console.log(`   a random authenticated user sees ${v} restaurant_orders`);
  if (Number(v) > 0) note('BUG', 'RLS leak on restaurant_orders', `an authenticated non-member sees ${v} rows`);
  else console.log('   non-member sees nothing ✓');
} else {
  console.log(`   (could not switch role: ${iso.error.slice(0, 120)})`);
}
const anon = await trySql(`
  set local role anon;
  select count(*) as n from public.courier_orders;`);
if (anon.ok) {
  const v = anon.rows[0]?.n;
  console.log(`   anon sees ${v} courier_orders`);
  if (Number(v) > 0) note('BUG', 'anon can read courier_orders', `${v} rows — these carry customer name, phone and address`);
  else console.log('   anon sees no courier orders ✓');
} else console.log(`   (anon check: ${anon.error.slice(0, 120)})`);

console.log('\n--- wave 2 findings ---');
console.log(findings.length ? table(findings) : 'none');
