// Seed a realistic Bucharest multi-vendor world on the test branch.
//
//   1 city, 5 fleets (1 tier=owner fallback + 4 operating), 50 couriers with
//   VERIFIED KYC / ONLINE shifts / live GPS, 20 tenants with menus, customers
//   and addresses.
//
// One tenant is deliberately left WITHOUT a fleet assignment, to exercise the
// PREPARING trigger's fallback-to-owner-fleet path.
import { sql, s, j, rng, scatter, table } from './lt-lib.mjs';

const r = rng(20260810);

// București is already seeded by the migrations (cities.name is unique), so
// reuse whatever id it has rather than inventing one.
const existing = await sql(`select id from public.cities where slug='bucuresti' or name='București' limit 1;`);
const CITY = existing[0]?.id;
if (!CITY) throw new Error('no Bucharest row in cities');
console.log('using city', CITY);
const FLEETS = [
  { id: 'f0000000-0000-0000-0000-000000000001', slug: 'hir-owner-fallback', name: 'HIR Owner Fallback', tier: 'owner' },
  { id: 'f0000000-0000-0000-0000-000000000002', slug: 'buc-nord',  name: 'Curieri Nord',  tier: 'partner' },
  { id: 'f0000000-0000-0000-0000-000000000003', slug: 'buc-sud',   name: 'Curieri Sud',   tier: 'partner' },
  { id: 'f0000000-0000-0000-0000-000000000004', slug: 'buc-est',   name: 'Curieri Est',   tier: 'partner' },
  { id: 'f0000000-0000-0000-0000-000000000005', slug: 'buc-vest',  name: 'Curieri Vest',  tier: 'partner' },
];
const VENDOR_NAMES = [
  'Pizzeria Verona','Burger Lab','Shaorma Regele','Trattoria Roma','Sushi Ginza',
  'Bistro Lipscani','Kebab House','Salad Point','Noodle Bar','Casa Bunicii',
  'Grill Master','Vegan Corner','Pasta Fresca','Taco Loco','Bao Street',
  'Pui la Rotisor','Pescaria Mica','Curry Leaf','Waffle Time','Supe si Ciorbe',
];
const CATS = ['Preparate principale', 'Garnituri', 'Băuturi'];

const q = [];

// Make the seed re-runnable: courier_shifts and fleet_restaurant_assignments
// have no natural key to conflict on, so a second run would duplicate them.
// Purge anything this script created before inserting again.
console.log('purging previous load-test data…');
// delivery_pricings / fleet_invoice_items / payout_items are ON DELETE RESTRICT
// against courier_orders, so the settlement rows have to go first.
await sql(`
  with co as (select id from public.courier_orders
               where source_tenant_id in (select id from public.tenants where slug like 'lt-vendor-%'))
  delete from public.delivery_pricings where delivery_id in (select id from co);
  with co as (select id from public.courier_orders
               where source_tenant_id in (select id from public.tenants where slug like 'lt-vendor-%'))
  delete from public.fleet_invoice_items where delivery_id in (select id from co);
  with co as (select id from public.courier_orders
               where source_tenant_id in (select id from public.tenants where slug like 'lt-vendor-%'))
  delete from public.payout_items where delivery_id in (select id from co);
  delete from public.courier_orders where source_tenant_id in (select id from public.tenants where slug like 'lt-vendor-%');
  delete from public.restaurant_orders where tenant_id in (select id from public.tenants where slug like 'lt-vendor-%');
  delete from public.fleet_restaurant_assignments where restaurant_tenant_id in (select id from public.tenants where slug like 'lt-vendor-%');
  delete from public.courier_shifts where courier_user_id in (select user_id from public.courier_profiles where phone like '+4079900%');
`);

q.push(`update public.cities set is_active = true where id = ${s(CITY)}::uuid;`);

// --- fleets: active, opted into auto-dispatch, KYC/KYF required (realistic) ---
for (const f of FLEETS) {
  q.push(`insert into public.courier_fleets
            (id, slug, name, tier, is_active, kyc_required, kyf_required, auto_dispatch_enabled, primary_city_id)
          values (${s(f.id)}::uuid, ${s(f.slug)}, ${s(f.name)}, ${s(f.tier)}, true, true, true, true, ${s(CITY)}::uuid)
          on conflict (id) do update set is_active = true, auto_dispatch_enabled = true;`);
  q.push(`insert into public.fleet_kyf (fleet_id, cui, company_name, kyf_status, verified_at)
          values (${s(f.id)}::uuid, ${s('RO' + (10000000 + Math.floor(r() * 8999999)))}, ${s(f.name + ' SRL')}, 'VERIFIED', now())
          on conflict (fleet_id) do update set kyf_status = 'VERIFIED', verified_at = now();`);
}

// --- 50 couriers ------------------------------------------------------
const couriers = [];
for (let i = 1; i <= 50; i++) {
  const id = `c0000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
  const fleet = FLEETS[1 + (i % 4)].id;          // spread over the 4 operating fleets
  const email = `lt-courier-${i}@hir.test`;
  const pos = scatter(r);
  couriers.push({ id, fleet, pos });
  q.push(`insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, is_sso_user, is_anonymous)
          values (${s(id)}::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated','authenticated',
            ${s(email)}, extensions.crypt('lt-no-login', extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, ${j({ load_test: true })}, false, now(), now(), false, false)
          on conflict (id) do nothing;`);
  q.push(`insert into public.courier_profiles (user_id, full_name, phone, vehicle_type, fleet_id, status, max_parallel_orders)
          values (${s(id)}::uuid, ${s('Curier LT ' + i)}, ${s('+4079900' + String(1000 + i))}, 'SCOOTER', ${s(fleet)}::uuid, 'ACTIVE', 3)
          on conflict (user_id) do update set status='ACTIVE', fleet_id=excluded.fleet_id, max_parallel_orders=3;`);
  q.push(`insert into public.courier_kyc (courier_user_id, fleet_id, legal_name, kyc_status, verified_at)
          values (${s(id)}::uuid, ${s(fleet)}::uuid, ${s('Curier LT ' + i)}, 'VERIFIED', now())
          on conflict (courier_user_id) do update set kyc_status='VERIFIED', verified_at=now();`);
  // ONLINE shift with a fresh heartbeat — the sweep requires last_seen_at < 5 min.
  q.push(`insert into public.courier_shifts (courier_user_id, started_at, status, last_lat, last_lng, last_seen_at)
          values (${s(id)}::uuid, now() - interval '2 hours', 'ONLINE', ${pos.lat}, ${pos.lng}, now());`);
}

// --- 20 tenants, menus, customers, addresses --------------------------
const tenants = [];
for (let i = 0; i < VENDOR_NAMES.length; i++) {
  const id = `70000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`;
  const slug = `lt-vendor-${i + 1}`;
  const pos = scatter(r, 0.04);
  tenants.push({ id, slug, name: VENDOR_NAMES[i] });
  q.push(`insert into public.tenants (id, slug, name, status, city_id, settings)
          values (${s(id)}::uuid, ${s(slug)}, ${s(VENDOR_NAMES[i])}, 'ACTIVE', ${s(CITY)}::uuid,
            ${j({
              pickup_address: { line1: `Str. Test ${i + 1}, București`, lat: pos.lat, lng: pos.lng, phone: '+40740000' + (100 + i), name: VENDOR_NAMES[i] },
              delivery_eta_min_minutes: 25, delivery_eta_max_minutes: 45,
            })})
          on conflict (id) do update set status='ACTIVE', settings=excluded.settings, city_id=excluded.city_id;`);

  // 19 of 20 get a fleet; vendor 20 is left unassigned on purpose.
  if (i < VENDOR_NAMES.length - 1) {
    q.push(`insert into public.fleet_restaurant_assignments (fleet_id, restaurant_tenant_id, role, status, assigned_at)
            values (${s(FLEETS[1 + (i % 4)].id)}::uuid, ${s(id)}::uuid, 'primary', 'active', now());`);
  }

  for (let c = 0; c < CATS.length; c++) {
    const cid = `80000000-${String(i + 1).padStart(4, '0')}-0000-0000-${String(c + 1).padStart(12, '0')}`;
    q.push(`insert into public.restaurant_menu_categories (id, tenant_id, name, sort_order)
            values (${s(cid)}::uuid, ${s(id)}::uuid, ${s(CATS[c])}, ${c}) on conflict (id) do nothing;`);
    for (let m = 1; m <= 4; m++) {
      q.push(`insert into public.restaurant_menu_items (id, tenant_id, category_id, name, price_ron, is_available)
              values (${s(`90000000-${String(i + 1).padStart(4, '0')}-${String(c + 1).padStart(4, '0')}-0000-${String(m).padStart(12, '0')}`)}::uuid,
                      ${s(id)}::uuid, ${s(cid)}::uuid, ${s(CATS[c] + ' ' + m)}, ${(15 + Math.floor(r() * 45)).toFixed(2)}, true)
              on conflict (id) do nothing;`);
    }
  }

  // 12 customers each, with a delivery address (required for a courier leg).
  for (let cu = 1; cu <= 12; cu++) {
    const cusId = `a0000000-${String(i + 1).padStart(4, '0')}-0000-0000-${String(cu).padStart(12, '0')}`;
    const adrId = `b0000000-${String(i + 1).padStart(4, '0')}-0000-0000-${String(cu).padStart(12, '0')}`;
    const dpos = scatter(r);
    q.push(`insert into public.customers (id, tenant_id, email, phone, first_name, last_name)
            values (${s(cusId)}::uuid, ${s(id)}::uuid, ${s(`lt-c${i + 1}-${cu}@hir.test`)}, ${s('+4072200' + String(1000 + cu))},
                    ${s('Client' + cu)}, 'LoadTest') on conflict (id) do nothing;`);
    q.push(`insert into public.customer_addresses (id, customer_id, line1, city, country, latitude, longitude, is_default)
            values (${s(adrId)}::uuid, ${s(cusId)}::uuid, ${s('Bd. Client ' + cu + ', București')}, 'București', 'RO',
                    ${dpos.lat}, ${dpos.lng}, true) on conflict (id) do nothing;`);
  }
}

console.log(`applying ${q.length} statements…`);
// Batch to keep each request small enough for the Management API.
const BATCH = 35;
for (let i = 0; i < q.length; i += BATCH) {
  await sql(q.slice(i, i + BATCH).join('\n'));
  process.stdout.write('.');
}
console.log('\nseeded.');

console.log(table(await sql(`
  select (select count(*) from public.tenants where slug like 'lt-vendor-%')          as tenants,
         (select count(*) from public.courier_fleets where slug like 'buc-%' or slug='hir-owner-fallback') as fleets,
         (select count(*) from public.courier_profiles where phone like '+4079900%')  as couriers,
         (select count(*) from public.courier_shifts where status='ONLINE')           as online_shifts,
         (select count(*) from public.restaurant_menu_items)                          as menu_items,
         (select count(*) from public.customers)                                      as customers,
         (select count(*) from public.fleet_restaurant_assignments where status='active') as assignments
`)));
