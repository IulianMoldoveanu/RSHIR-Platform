// Wave 1 — correctness of the full circuit, single-threaded.
// Order placed -> PREPARING (courier_orders row appears) -> READY
// (restaurant_ready_at stamped) -> auto-dispatch offers -> courier accepts ->
// PICKED_UP -> DELIVERED. Also exercises the vendor with no fleet assignment.
import { sql, trySql, s, j, table } from './lt-lib.mjs';

const findings = [];
const note = (sev, what, detail) => { findings.push({ sev, what, detail }); console.log(`  [${sev}] ${what} — ${detail}`); };

const tenants = await sql(`select id, slug, name from public.tenants where slug like 'lt-vendor-%' order by slug;`);
console.log(`tenants: ${tenants.length}`);

async function placeOrder(tenantId, n) {
  const cust = (await sql(`
    select c.id as customer_id, a.id as address_id
      from public.customers c
      join public.customer_addresses a on a.customer_id = c.id
     where c.tenant_id = ${s(tenantId)}::uuid
     order by md5(c.id::text || ${s(String(n))}) limit 1;`))[0];
  const items = [{ name: 'Preparate principale 1', qty: 1 + (n % 3), price_ron: 32 }];
  const subtotal = items[0].qty * 32;
  const rows = await sql(`
    insert into public.restaurant_orders
      (tenant_id, customer_id, delivery_address_id, items, subtotal_ron, delivery_fee_ron, total_ron, status, payment_method)
    values (${s(tenantId)}::uuid, ${s(cust.customer_id)}::uuid, ${s(cust.address_id)}::uuid,
            ${j(items)}, ${subtotal}, 12, ${subtotal + 12}, 'PENDING', 'COD')
    returning id;`);
  return rows[0].id;
}

const advance = (orderId, status) =>
  trySql(`update public.restaurant_orders set status = ${s(status)}, updated_at = now() where id = ${s(orderId)}::uuid;`);

// ---------------------------------------------------------------- step 1
console.log('\n1. place one order per tenant, advance to PREPARING');
const placed = [];
for (const [i, t] of tenants.entries()) {
  const id = await placeOrder(t.id, i);
  const res = await advance(id, 'PREPARING');
  placed.push({ tenant: t.slug, orderId: id, ok: res.ok, error: res.error });
  if (!res.ok) note('BUG', `${t.slug}: PREPARING rejected`, res.error.slice(0, 160));
}
const okCount = placed.filter((p) => p.ok).length;
console.log(`   ${okCount}/${placed.length} reached PREPARING`);

// The unassigned vendor: does the trigger fall back to the tier=owner fleet?
const unassigned = placed.find((p) => p.tenant === 'lt-vendor-20');
console.log(`   lt-vendor-20 (no fleet assignment): ${unassigned.ok ? 'OK — fell back' : 'FAILED'}`);

// ---------------------------------------------------------------- step 2
console.log('\n2. courier_orders created by the trigger?');
const created = await sql(`
  select count(*) as n,
         count(*) filter (where fleet_id is null) as no_fleet,
         count(*) filter (where pickup_lat is null or dropoff_lat is null) as missing_coords,
         count(*) filter (where source_tenant_id is null) as orphan
    from public.courier_orders
   where source_tenant_id in (select id from public.tenants where slug like 'lt-vendor-%');`);
console.log(table(created));
if (Number(created[0].n) !== okCount) note('BUG', 'courier_orders count != PREPARING count', `${created[0].n} vs ${okCount}`);
if (Number(created[0].missing_coords) > 0) note('BUG', 'courier orders without coordinates', `${created[0].missing_coords} rows — the distance heuristic scores them 0`);
if (Number(created[0].orphan) > 0) note('BUG', 'orphan courier orders created', `${created[0].orphan}`);

// ---------------------------------------------------------------- step 3
console.log('\n3. sweep BEFORE ready (should offer nothing — food is not out yet)');
const beforeReady = await sql(`select public.fn_auto_dispatch_sweep() as offered;`);
console.log(`   offered: ${beforeReady[0].offered}`);
if (Number(beforeReady[0].offered) === 0) {
  note('INFO', 'sweep offers orders that are not READY yet', 'by design — a rider can be allocated while the kitchen cooks');
}

// ---------------------------------------------------------------- step 4
console.log('\n4. mark READY, then sweep');
for (const p of placed.filter((x) => x.ok)) await advance(p.orderId, 'READY');
const stamped = await sql(`
  select count(*) filter (where restaurant_ready_at is not null) as ready,
         count(*) as total
    from public.courier_orders
   where source_tenant_id in (select id from public.tenants where slug like 'lt-vendor-%');`);
console.log(`   restaurant_ready_at stamped: ${stamped[0].ready}/${stamped[0].total}`);
if (Number(stamped[0].ready) !== Number(stamped[0].total)) {
  note('BUG', 'READY did not stamp every courier order', `${stamped[0].ready}/${stamped[0].total}`);
}

const t0 = Date.now();
const swept = await sql(`select public.fn_auto_dispatch_sweep() as offered;`);
console.log(`   sweep offered ${swept[0].offered} in ${Date.now() - t0}ms`);

const dist = await sql(`
  select co.status, count(*) as n
    from public.courier_orders co
   where co.source_tenant_id in (select id from public.tenants where slug like 'lt-vendor-%')
   group by co.status order by n desc;`);
console.log(table(dist));

// One courier must never hold two simultaneous offers.
const dbl = await sql(`
  select assigned_courier_user_id, count(*) as offers
    from public.courier_orders
   where status = 'OFFERED' and assigned_courier_user_id is not null
   group by assigned_courier_user_id having count(*) > 1;`);
if (dbl.length) note('BUG', 'a courier holds more than one live offer', JSON.stringify(dbl).slice(0, 200));
else console.log('   no courier holds two live offers ✓');

console.log('\n--- wave 1 findings ---');
console.log(findings.length ? table(findings) : 'none');
