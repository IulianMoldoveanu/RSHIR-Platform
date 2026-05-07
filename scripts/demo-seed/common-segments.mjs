// Shared segment-aware seeding helpers.
//
// This module wraps scripts/demo-seed/common.mjs with a higher-level seeder that
// accepts a segment config (slug, menu, order volume, courier count, city) and
// produces a self-contained sandbox tenant + 30 days of activity.
//
// Keeps the four per-segment scripts (pizzerie-mica, fast-food-activ,
// restaurant-familial, cofetarie) thin: each just exports a SEGMENT object and
// calls runSegmentSeed(SEGMENT).
//
// Hard rules:
//   - Refuses to run against tenant slug 'foisorul-a' (real tenant).
//   - Refuses to run if HIR_ENV=production and --allow-prod was not passed.
//   - All demo tenant slugs MUST start with 'demo-'.
//
// Marker conventions (cleanup contract — keep aligned with the per-tenant
// cleanup function in this file):
//   - tenants.slug starts with 'demo-' AND tenants.settings.demo_seed = true
//   - customers.email LIKE '%@hir-demo.ro'
//   - restaurant_orders.notes starts with '[DEMO_SEED]'
//   - courier_profiles.phone starts with '+4070099'
//   - courier_orders.source_order_id starts with 'DEMO-SEED-'

import { argv, env, exit } from 'node:process';
import {
  loadSecrets,
  makeSqlRunner,
  makeRng,
  sqlStr,
  sqlJson,
  sqlTs,
  DEMO_MARKERS,
} from './common.mjs';

const PROTECTED_SLUGS = new Set(['foisorul-a']);

export function parseSegmentArgs() {
  const args = { dryRun: false, reset: false, allowProd: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--reset') args.reset = true;
    else if (a === '--allow-prod') args.allowProd = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        'usage: node scripts/demo-seed/<segment>.mjs [--dry-run] [--reset] [--allow-prod]',
      );
      exit(0);
    } else {
      console.error(`unknown arg: ${a}`);
      exit(2);
    }
  }
  return args;
}

// City coordinates + street pools (used for customer addresses + pickup point).
export const CITIES = {
  Brașov: {
    lat: 45.6427,
    lng: 25.5887,
    streets: [
      'Str. Republicii', 'Bd. Eroilor', 'Str. Lungă', 'Str. Mureșenilor',
      'Bd. 15 Noiembrie', 'Str. De Mijloc', 'Str. Castelului', 'Bd. Saturn',
      'Str. Calea București', 'Bd. Alexandru Vlahuță', 'Str. Toamnei',
      'Bd. Griviței', 'Str. Carpaților', 'Str. Iuliu Maniu',
      'Str. Postăvarului', 'Bd. Gării',
    ],
    postal: '500',
  },
  București: {
    lat: 44.4268,
    lng: 26.1025,
    streets: [
      'Calea Victoriei', 'Bd. Magheru', 'Bd. Unirii', 'Str. Lipscani',
      'Bd. Dacia', 'Bd. Aviatorilor', 'Bd. Iancu de Hunedoara',
      'Calea Dorobanți', 'Bd. Carol I', 'Bd. Regina Elisabeta',
      'Str. Doamnei', 'Str. Smârdan', 'Bd. Ferdinand', 'Bd. Mihai Bravu',
      'Str. Văcărești', 'Calea Călărași',
    ],
    postal: '030',
  },
  Cluj: {
    lat: 46.7712,
    lng: 23.6236,
    streets: [
      'Str. Memorandumului', 'Bd. Eroilor', 'Str. Avram Iancu',
      'Bd. 21 Decembrie 1989', 'Calea Mănăștur', 'Bd. Nicolae Titulescu',
      'Str. Horea', 'Str. Regele Ferdinand', 'Calea Florești',
      'Bd. 1 Decembrie 1918', 'Str. Republicii', 'Calea Turzii',
      'Str. Mihai Viteazu', 'Bd. 21 Octombrie',
    ],
    postal: '400',
  },
};

const FIRST_NAMES = [
  'Andrei', 'Maria', 'Mihai', 'Elena', 'Cristian', 'Ioana', 'Radu', 'Alina',
  'Stefan', 'Ana', 'Bogdan', 'Diana', 'Catalin', 'Roxana', 'Vlad', 'Simona',
  'George', 'Adriana', 'Razvan', 'Iulia', 'Daniel', 'Carmen', 'Sebastian',
  'Mihaela', 'Alexandru', 'Gabriela', 'Florin', 'Cristina', 'Adrian', 'Andreea',
];

const LAST_NAMES = [
  'Popescu', 'Ionescu', 'Stoica', 'Dumitrescu', 'Constantinescu', 'Marinescu',
  'Georgescu', 'Stan', 'Munteanu', 'Radu', 'Popa', 'Diaconu', 'Nistor',
  'Tudor', 'Pavel', 'Cojocaru', 'Niculescu', 'Iordan', 'Voicu', 'Lazar',
];

const REVIEW_POSITIVE = [
  'Mâncare excelentă, recomand cu căldură!',
  'Cea mai bună alegere din zonă, livrare rapidă.',
  'Comandăm săptămânal — porții generoase și gust autentic.',
  'Curierul a fost super amabil, totul a sosit cald.',
  'Foarte rapid, totul perfect ambalat.',
  'Calitate excelentă, prețuri corecte.',
  'Mulțumim, vom reveni cu siguranță!',
];

const REVIEW_NEUTRAL = [
  'Bine, dar a sosit cam rece.',
  'OK în general, dar livrarea a durat puțin mai mult decât promis.',
  'Mâncarea bună, dar lipseau sosurile pe care le-am cerut.',
  'Decent, dar prețul mi se pare ușor ridicat.',
];

const REVIEW_NEGATIVE = [
  'Mâncarea a sosit rece, nu vom mai comanda.',
  'Curier dezamăgitor, livrare cu mult peste timpul promis.',
  'Calitate sub așteptări pentru preț.',
];

// ---- production guard ------------------------------------------------------
export function productionGuard(args) {
  if (env.HIR_ENV === 'production' && !args.allowProd) {
    console.error(
      '[demo-seed] HIR_ENV=production detected. Refusing to run without --allow-prod.',
    );
    exit(2);
  }
}

// ---- main entry ------------------------------------------------------------
//
// Segment shape:
//   {
//     slug: 'demo-pizzerie-mica',          // MUST start with 'demo-'
//     name: 'Pizzeria Demo Cartier',
//     city: 'Brașov',                       // key into CITIES
//     ordersPerDay: 25,                     // average
//     avgTicketRon: 65,                     // target AOV
//     menu: [{ category, name, price, desc, isPopular?: true }, ...],
//     courierCount: 1,
//     reservationsEnabled: false,           // restaurant-familial only
//     preorderShare: 0,                     // cofetarie: 0.6 = 60% of orders are scheduled pre-orders
//   }
//
export async function runSegmentSeed(segment) {
  // Validate.
  if (!segment.slug || !segment.slug.startsWith('demo-')) {
    console.error(`[demo-seed] segment slug must start with 'demo-' (got ${segment.slug})`);
    exit(2);
  }
  if (PROTECTED_SLUGS.has(segment.slug)) {
    console.error(`[demo-seed] refusing to operate on protected slug: ${segment.slug}`);
    exit(2);
  }

  const args = parseSegmentArgs();
  productionGuard(args);
  const secrets = loadSecrets();
  const runSql = await makeSqlRunner(secrets, { dryRun: args.dryRun });

  console.log(
    `[demo-seed:${segment.slug}] target project ref: ${secrets.SUPABASE_PROJECT_REF}` +
      (args.dryRun ? ' (DRY-RUN)' : ''),
  );
  console.log(
    `[demo-seed:${segment.slug}] segment: ${segment.name} | city=${segment.city} ` +
      `ord/day=${segment.ordersPerDay} AOV=${segment.avgTicketRon} RON ` +
      `couriers=${segment.courierCount} menu=${segment.menu.length}`,
  );

  // 1. Optional reset (delete existing demo tenant + cascade).
  if (args.reset) {
    console.log(`[demo-seed:${segment.slug}] --reset: deleting existing demo tenant if any`);
    await runSql(buildTenantCleanupSql(segment.slug));
  }

  // 2. Resolve or create the tenant.
  const TENANT_ID = await ensureTenant(runSql, segment, args.dryRun);
  console.log(`[demo-seed:${segment.slug}] tenant id: ${TENANT_ID}`);

  // 3. Idempotency snapshot.
  const snap = await runSql(`
    select
      (select count(*)::int from public.customers
         where tenant_id = ${sqlStr(TENANT_ID)}::uuid
           and email like '%${DEMO_MARKERS.CUSTOMER_EMAIL_DOMAIN}') as customers,
      (select count(*)::int from public.restaurant_orders
         where tenant_id = ${sqlStr(TENANT_ID)}::uuid
           and notes like '${DEMO_MARKERS.ORDER_NOTES_PREFIX}%') as orders,
      (select count(*)::int from public.restaurant_menu_items
         where tenant_id = ${sqlStr(TENANT_ID)}::uuid) as menu_items;
  `);
  const counts = Array.isArray(snap) ? snap[0] : {};
  const targetOrders = segment.ordersPerDay * 30;
  if ((counts.orders ?? 0) >= targetOrders - 30) {
    console.log(
      `[demo-seed:${segment.slug}] already at/near target ` +
        `(${counts.orders}/${targetOrders} orders). Pass --reset to wipe + reseed.`,
    );
    return TENANT_ID;
  }

  // 4. Menu (idempotent).
  if ((counts.menu_items ?? 0) < segment.menu.length) {
    await seedMenu(runSql, TENANT_ID, segment);
    console.log(`[demo-seed:${segment.slug}] menu seeded (${segment.menu.length} items)`);
  } else {
    console.log(`[demo-seed:${segment.slug}] menu already has ${counts.menu_items} items, skipping`);
  }

  // 5. Delivery zone (single ~5km circle around city center, idempotent).
  await ensureDeliveryZone(runSql, TENANT_ID, segment);

  // 6. Reservation settings (only for segments that enable it).
  if (segment.reservationsEnabled) {
    await runSql(`
      insert into public.reservation_settings (tenant_id, is_enabled)
      values (${sqlStr(TENANT_ID)}::uuid, true)
      on conflict (tenant_id) do update set is_enabled = excluded.is_enabled;
    `);
    console.log(`[demo-seed:${segment.slug}] reservations enabled`);
  }

  // 7. Pull menu back to know real ids/prices for orders.
  const menuRows = await runSql(`
    select i.id, i.name, i.price_ron::float as price, c.name as cat
    from public.restaurant_menu_items i
    join public.restaurant_menu_categories c on c.id = i.category_id
    where i.tenant_id = ${sqlStr(TENANT_ID)}::uuid
      and i.is_available = true
    order by i.created_at asc;
  `);
  const menu = (Array.isArray(menuRows) ? menuRows : []).map((m) => ({
    id: m.id,
    name: m.name,
    price: Number(m.price),
    cat: m.cat,
  }));
  if (menu.length < 5) {
    console.error(`[demo-seed:${segment.slug}] menu under 5 items after seed, aborting`);
    exit(1);
  }

  // 8. Default fleet (NOT NULL FK on courier_profiles + courier_orders).
  let fleetId = await ensureDefaultFleet(runSql, args.dryRun);

  // 9. Couriers (segment.courierCount).
  const courierAuthUuids = await seedCouriers(runSql, segment, fleetId);
  console.log(`[demo-seed:${segment.slug}] couriers seeded (${courierAuthUuids.length})`);

  // 10. Customers + addresses + orders + reviews + courier shifts/orders.
  await seedActivity(runSql, {
    segment,
    tenantId: TENANT_ID,
    menu,
    fleetId,
    courierAuthUuids,
  });

  // 11. Final summary.
  const summary = await runSql(`
    select
      (select count(*)::int from public.customers
         where tenant_id = ${sqlStr(TENANT_ID)}::uuid
           and email like '%${DEMO_MARKERS.CUSTOMER_EMAIL_DOMAIN}') as customers,
      (select count(*)::int from public.restaurant_orders
         where tenant_id = ${sqlStr(TENANT_ID)}::uuid
           and notes like '${DEMO_MARKERS.ORDER_NOTES_PREFIX}%') as orders,
      (select coalesce(sum(total_ron), 0)::numeric(12,2) from public.restaurant_orders
         where tenant_id = ${sqlStr(TENANT_ID)}::uuid
           and notes like '${DEMO_MARKERS.ORDER_NOTES_PREFIX}%'
           and status <> 'CANCELLED') as revenue,
      (select count(*)::int from public.restaurant_reviews r
         join public.restaurant_orders o on o.id = r.order_id
         where r.tenant_id = ${sqlStr(TENANT_ID)}::uuid
           and o.notes like '${DEMO_MARKERS.ORDER_NOTES_PREFIX}%') as reviews;
  `);
  const s = Array.isArray(summary) ? summary[0] : {};
  console.log('');
  console.log(`[demo-seed:${segment.slug}] === SEEDING COMPLETE ===`);
  console.log(`  tenant slug:       ${segment.slug}`);
  console.log(`  customers:         ${s.customers}`);
  console.log(`  orders:            ${s.orders}`);
  console.log(`  revenue (RON):     ${s.revenue}`);
  console.log(`  reviews:           ${s.reviews}`);
  console.log(`  storefront URL:    https://${segment.slug}.hir.ro/  (or per host routing)`);
  console.log(`  admin URL:         https://admin.hir.ro/dashboard?tenant=${segment.slug}`);
  console.log('');
  return TENANT_ID;
}

// ---- ensureTenant ----------------------------------------------------------
async function ensureTenant(runSql, segment, dryRun) {
  const existing = await runSql(
    `select id from public.tenants where slug = ${sqlStr(segment.slug)} limit 1;`,
  );
  if (Array.isArray(existing) && existing[0] && existing[0].id) {
    return existing[0].id;
  }
  if (dryRun) return '00000000-0000-0000-0000-000000000000';
  const settings = {
    demo_seed: true,
    segment: segment.segmentKey,
    primary_city: segment.city,
    avg_ticket_ron: segment.avgTicketRon,
    fiscal: { vat_rate_pct: 9 },
  };
  const ins = await runSql(`
    insert into public.tenants (slug, name, vertical, status, dispatch_mode, settings)
    values (
      ${sqlStr(segment.slug)},
      ${sqlStr(segment.name)},
      'RESTAURANT',
      'ACTIVE',
      'MANUAL',
      ${sqlJson(settings)}
    )
    returning id;
  `);
  if (!Array.isArray(ins) || !ins[0] || !ins[0].id) {
    console.error(`[demo-seed:${segment.slug}] failed to create tenant`);
    exit(1);
  }
  return ins[0].id;
}

// ---- seedMenu --------------------------------------------------------------
async function seedMenu(runSql, tenantId, segment) {
  // Distinct categories preserved from segment.menu order.
  const cats = [...new Set(segment.menu.map((m) => m.category))];
  const sql = ['begin;'];
  cats.forEach((c, i) => {
    sql.push(`
      insert into public.restaurant_menu_categories (tenant_id, name, sort_order)
      values (${sqlStr(tenantId)}::uuid, ${sqlStr(c)}, ${i})
      on conflict do nothing;
    `);
  });
  // Build a single insert per item, looking up category id inline.
  segment.menu.forEach((m, i) => {
    sql.push(`
      insert into public.restaurant_menu_items (
        tenant_id, category_id, name, description, price_ron, sort_order, is_available
      )
      select
        ${sqlStr(tenantId)}::uuid,
        c.id,
        ${sqlStr(m.name)},
        ${sqlStr(m.desc ?? null)},
        ${m.price.toFixed(2)},
        ${i},
        true
      from public.restaurant_menu_categories c
      where c.tenant_id = ${sqlStr(tenantId)}::uuid and c.name = ${sqlStr(m.category)}
      and not exists (
        select 1 from public.restaurant_menu_items i
        where i.tenant_id = ${sqlStr(tenantId)}::uuid and i.name = ${sqlStr(m.name)}
      );
    `);
  });
  sql.push('commit;');
  await runSql(sql.join('\n'));
}

// ---- ensureDeliveryZone ----------------------------------------------------
async function ensureDeliveryZone(runSql, tenantId, segment) {
  const city = CITIES[segment.city];
  if (!city) {
    console.error(`[demo-seed:${segment.slug}] unknown city ${segment.city}`);
    exit(1);
  }
  // Build a 24-sided ~5km polygon around the city centroid.
  const points = [];
  const radiusKm = 5;
  const latDeg = radiusKm / 111;
  const lngDeg = radiusKm / (111 * Math.cos((city.lat * Math.PI) / 180));
  for (let i = 0; i <= 24; i++) {
    const a = (i * 2 * Math.PI) / 24;
    points.push([
      Number((city.lng + lngDeg * Math.cos(a)).toFixed(6)),
      Number((city.lat + latDeg * Math.sin(a)).toFixed(6)),
    ]);
  }
  const polygon = { type: 'Polygon', coordinates: [points] };
  await runSql(`
    insert into public.delivery_zones (tenant_id, name, polygon, is_active, sort_order)
    select ${sqlStr(tenantId)}::uuid,
           ${sqlStr(`${segment.city} 5 km`)},
           ${sqlJson(polygon)},
           true,
           0
    where not exists (
      select 1 from public.delivery_zones z
      where z.tenant_id = ${sqlStr(tenantId)}::uuid
    );
  `);
}

// ---- ensureDefaultFleet ----------------------------------------------------
async function ensureDefaultFleet(runSql, dryRun) {
  const rows = await runSql(`
    select id from public.courier_fleets
    where lower(name) like 'hir default%'
    order by created_at asc
    limit 1;
  `);
  let fleetId = (Array.isArray(rows) && rows[0]) ? rows[0].id : null;
  if (!fleetId && !dryRun) {
    console.error('[demo-seed] no "HIR Default Fleet" courier_fleet found — aborting.');
    exit(1);
  }
  return fleetId ?? '00000000-0000-0000-0000-fleet00000000';
}

// ---- seedCouriers ----------------------------------------------------------
async function seedCouriers(runSql, segment, fleetId) {
  const VEHICLES = ['SCOOTER', 'CAR', 'BIKE'];
  const FIRSTS = ['Vasile', 'Marius', 'Ionut', 'Cristian', 'Adrian', 'George'];
  const LASTS = ['Tudor', 'Cojocaru', 'Popa', 'Lazar', 'Stoica', 'Munteanu'];
  // Hash segment.slug into a 4-byte ASCII hex prefix to keep courier UUIDs
  // distinct across segments. Collision-free across our 4 demo segments.
  const slugHash = hashSlugFour(segment.slug);
  const courierUuids = [];
  const sql = ['begin;'];
  for (let i = 0; i < segment.courierCount; i++) {
    const u = `${slugHash}-d3a1-4ec0-aa00-${String(i).padStart(9, '0')}c01`;
    courierUuids.push(u);
    const fn = FIRSTS[i % FIRSTS.length];
    const ln = LASTS[i % LASTS.length];
    const vehicle = VEHICLES[i % VEHICLES.length];
    const phoneTail = (slugHash.slice(-2) + String(i).padStart(2, '0')).slice(-4);
    const email = `courier${slugHash.slice(-4)}${String(i + 1).padStart(2, '0')}${DEMO_MARKERS.COURIER_AUTH_EMAIL_DOMAIN}`;
    const phone = `${DEMO_MARKERS.COURIER_PHONE_PREFIX}${phoneTail}`;
    sql.push(`
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, is_super_admin,
        created_at, updated_at, is_sso_user, is_anonymous
      ) values (
        ${sqlStr(u)}::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated',
        ${sqlStr(email)},
        crypt('demo-no-login-${i}', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        ${sqlJson({ demo_seed: true, segment: segment.segmentKey, full_name: `${fn} ${ln}` })},
        false, now(), now(), false, false
      )
      on conflict (id) do nothing;
    `);
    sql.push(`
      insert into public.courier_profiles (
        user_id, full_name, phone, vehicle_type, status, fleet_id, created_at
      ) values (
        ${sqlStr(u)}::uuid,
        ${sqlStr(`${fn} ${ln}`)},
        ${sqlStr(phone)},
        ${sqlStr(vehicle)},
        'ACTIVE',
        ${sqlStr(fleetId)}::uuid,
        now() - interval '${20 + i * 10} days'
      )
      on conflict (user_id) do nothing;
    `);
  }
  sql.push('commit;');
  await runSql(sql.join('\n'));
  return courierUuids;
}

function hashSlugFour(slug) {
  // Tiny FNV-32a → 8 hex chars (UUID first segment).
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0').slice(0, 8);
}

// ---- seedActivity ----------------------------------------------------------
async function seedActivity(runSql, { segment, tenantId, menu, fleetId, courierAuthUuids }) {
  const rng = makeRng(hashSeed(segment.slug));
  const NOW = new Date('2026-05-07T18:00:00Z'); // anchor "now" for stable screenshots
  const city = CITIES[segment.city];

  // 1. Customers — ~ordersPerDay × 30 × 0.55 unique customers (60% return rate).
  const totalCustomers = Math.max(40, Math.round(segment.ordersPerDay * 30 * 0.55));
  const customers = [];
  for (let i = 0; i < totalCustomers; i++) {
    const fn = rng.pick(FIRST_NAMES);
    const ln = rng.pick(LAST_NAMES);
    let firstSeenDaysAgo;
    if (rng.next() < 0.6) firstSeenDaysAgo = rng.randInt(0, 10);
    else firstSeenDaysAgo = rng.randInt(11, 29);
    const street = rng.pick(city.streets);
    const num = rng.randInt(1, 180);
    const lat = city.lat + (rng.next() - 0.5) * 0.05;
    const lng = city.lng + (rng.next() - 0.5) * 0.06;
    customers.push({
      idx: i,
      first_name: fn,
      last_name: ln,
      // Slug hash in email keeps customers distinct across segments + lets a
      // single cleanup pass identify which segment a row came from.
      email: `demo${segment.slug.replace('demo-', '')}-${String(i).padStart(3, '0')}${DEMO_MARKERS.CUSTOMER_EMAIL_DOMAIN}`,
      phone: `${DEMO_MARKERS.CUSTOMER_PHONE_PREFIX}${String(i).padStart(4, '0')}`,
      addr: {
        line1: `${street} nr. ${num}`,
        city: segment.city,
        postal: `${city.postal}${rng.randInt(10, 99)}`,
        lat,
        lng,
      },
      firstSeenDaysAgo,
    });
  }

  // Insert customers + addresses (idempotent — natural key on tenant_id+email).
  const custSql = ['begin;'];
  const custValues = customers.map((c) =>
    `(${sqlStr(tenantId)}::uuid, ${sqlStr(c.email)}, ${sqlStr(c.phone)}, ` +
      `${sqlStr(c.first_name)}, ${sqlStr(c.last_name)}, ` +
      `now() - interval '${c.firstSeenDaysAgo} days')`
  ).join(',\n  ');
  custSql.push(`
    insert into public.customers (tenant_id, email, phone, first_name, last_name, created_at)
    select v.* from (values
      ${custValues}
    ) as v(tenant_id, email, phone, first_name, last_name, created_at)
    where not exists (
      select 1 from public.customers c
      where c.tenant_id = v.tenant_id and c.email = v.email
    );
  `);
  custSql.push(`
    drop table if exists pg_temp.demo_seed_customer_map;
    create temp table pg_temp.demo_seed_customer_map as
      select id, email from public.customers
      where tenant_id = ${sqlStr(tenantId)}::uuid
        and email like '%${DEMO_MARKERS.CUSTOMER_EMAIL_DOMAIN}';
    create index on pg_temp.demo_seed_customer_map (email);
  `);
  const addrValues = customers.map((c) =>
    `((select id from pg_temp.demo_seed_customer_map where email = ${sqlStr(c.email)}), ` +
      `${sqlStr(c.addr.line1)}, ${sqlStr(c.addr.city)}, ${sqlStr(c.addr.postal)}, 'RO', ` +
      `${c.addr.lat.toFixed(6)}, ${c.addr.lng.toFixed(6)}, 'Acasă', ` +
      `now() - interval '${c.firstSeenDaysAgo} days')`
  ).join(',\n  ');
  custSql.push(`
    insert into public.customer_addresses (
      customer_id, line1, city, postal_code, country, latitude, longitude, label, created_at
    )
    select v.* from (values
      ${addrValues}
    ) as v(customer_id, line1, city, postal_code, country, latitude, longitude, label, created_at)
    where v.customer_id is not null
      and not exists (
        select 1 from public.customer_addresses ca where ca.customer_id = v.customer_id
      );
  `);
  custSql.push('commit;');
  await runSql(custSql.join('\n'));
  console.log(`[demo-seed:${segment.slug}] customers + addresses seeded (${customers.length})`);

  // 2. Orders — distribute across 30 days with realistic peaks + weekend bump.
  const orderPlan = [];
  for (let dayAgo = 29; dayAgo >= 0; dayAgo--) {
    const dayDate = new Date(NOW.getTime() - dayAgo * 24 * 3600 * 1000);
    const isWeekend = dayDate.getUTCDay() === 0 || dayDate.getUTCDay() === 6;
    const dayMul = isWeekend ? 1.3 : 1.0;
    // ±20% jitter
    const jitter = 0.8 + rng.next() * 0.4;
    const dayCount = Math.round(segment.ordersPerDay * dayMul * jitter);
    for (let k = 0; k < dayCount; k++) {
      const bucket = rng.weighted([['LUNCH', 35], ['DINNER', 40], ['OTHER', 25]]);
      let hour, minute;
      if (bucket === 'LUNCH') { hour = rng.randInt(12, 13); minute = rng.randInt(0, 59); }
      else if (bucket === 'DINNER') { hour = rng.randInt(19, 21); minute = rng.randInt(0, 59); }
      else { hour = rng.randInt(10, 22); minute = rng.randInt(0, 59); }
      const ts = new Date(dayDate);
      ts.setUTCHours(hour, minute, rng.randInt(0, 59), 0);
      if (ts > NOW) continue;
      orderPlan.push({ ts, dayAgo });
    }
  }
  console.log(`[demo-seed:${segment.slug}] order plan: ${orderPlan.length} orders / 30d`);

  // Popular items (used to bias baskets up to AOV target).
  const popularIdx = [];
  menu.forEach((m, i) => {
    if (m.price >= segment.avgTicketRon * 0.4) popularIdx.push(i);
  });
  while (popularIdx.length < Math.min(5, menu.length)) popularIdx.push(menu.length - 1);

  // Customer picker — 60% returning, 40% first-time of that day.
  function pickCustomer(daysAgo) {
    const eligible = customers.filter((c) => c.firstSeenDaysAgo >= daysAgo);
    if (eligible.length === 0) return rng.pick(customers);
    return rng.pick(eligible);
  }

  function buildItems() {
    const itemCount = rng.weighted([[1, 25], [2, 45], [3, 22], [4, 8]]);
    const items = [];
    let subtotal = 0;
    for (let k = 0; k < itemCount; k++) {
      const idx = rng.next() < 0.4 ? rng.pick(popularIdx) : rng.randInt(0, menu.length - 1);
      const m = menu[idx];
      const qty = rng.weighted([[1, 70], [2, 22], [3, 6], [4, 2]]);
      items.push({
        item_id: m.id,
        name: m.name,
        quantity: qty,
        price_ron: m.price,
        modifiers: [],
      });
      subtotal += m.price * qty;
    }
    // Nudge toward AOV target.
    const minTicket = Math.round(segment.avgTicketRon * 0.6);
    while (subtotal < minTicket) {
      const m = menu[rng.pick(popularIdx)];
      items.push({ item_id: m.id, name: m.name, quantity: 1, price_ron: m.price, modifiers: [] });
      subtotal += m.price;
    }
    return { items, subtotal: Math.round(subtotal * 100) / 100 };
  }

  function pickStatus(orderTs) {
    const ageHours = (NOW.getTime() - orderTs.getTime()) / 3600000;
    if (ageHours > 24) return rng.weighted([['DELIVERED', 92], ['CANCELLED', 8]]);
    if (ageHours < 0.5) return 'PENDING';
    if (ageHours < 1) return rng.weighted([['CONFIRMED', 60], ['PENDING', 40]]);
    if (ageHours < 1.5) return rng.weighted([['PREPARING', 70], ['CONFIRMED', 30]]);
    if (ageHours < 2) return rng.weighted([['IN_DELIVERY', 60], ['PREPARING', 30], ['READY', 10]]);
    return rng.weighted([['DELIVERED', 90], ['CANCELLED', 5], ['IN_DELIVERY', 5]]);
  }

  // Pre-orders (cofetărie): mark a configurable share with notes that include
  // a future pickup window. We still write them as past orders for KPI realism;
  // the pre-order share just changes the notes string for demo color.
  const preorderShare = segment.preorderShare ?? 0;

  // Pull single zone id (we created exactly 1).
  const zoneRow = await runSql(`
    select id from public.delivery_zones
    where tenant_id = ${sqlStr(tenantId)}::uuid and is_active = true
    limit 1;
  `);
  const zoneId = (Array.isArray(zoneRow) && zoneRow[0]) ? zoneRow[0].id : null;

  // Build order specs.
  const orders = [];
  for (let i = 0; i < orderPlan.length; i++) {
    const plan = orderPlan[i];
    const cust = pickCustomer(plan.dayAgo);
    const { items, subtotal } = buildItems();
    const status = pickStatus(plan.ts);
    const paymentMethod = rng.weighted([['COD', 60], ['CARD', 40]]);
    // Pickup share varies per segment: pizzerie/restaurant 8%, fast-food 15%,
    // cofetărie 25% (pre-orders frequently picked up at counter).
    const pickupShare = segment.segmentKey === 'cofetarie' ? 0.25
      : segment.segmentKey === 'fast-food-activ' ? 0.15
      : 0.08;
    const isPickup = rng.next() < pickupShare;
    const deliveryFee = isPickup ? 0 : rng.weighted([[10, 50], [12, 30], [15, 20]]);
    const total = Math.round((subtotal + deliveryFee) * 100) / 100;
    let paymentStatus;
    if (status === 'CANCELLED') paymentStatus = 'UNPAID';
    else if (paymentMethod === 'COD') paymentStatus = 'UNPAID';
    else if (status === 'DELIVERED') paymentStatus = 'PAID';
    else if (status === 'PENDING') paymentStatus = 'UNPAID';
    else paymentStatus = 'PAID';
    const isPreorder = preorderShare > 0 && rng.next() < preorderShare;
    const noteSuffix = isPreorder ? ' precomandă-eveniment' : '';
    orders.push({
      idx: i,
      ts: plan.ts,
      custIdx: cust.idx,
      items, subtotal, deliveryFee, total,
      status, paymentStatus, paymentMethod,
      isPickup,
      zoneId: !isPickup ? zoneId : null,
      notes: `${DEMO_MARKERS.ORDER_NOTES_PREFIX} ${segment.segmentKey}#${String(i).padStart(4, '0')}${noteSuffix}`,
    });
  }

  // Insert orders in batches of 100.
  const ORDER_BATCH = 100;
  let inserted = 0;
  for (let start = 0; start < orders.length; start += ORDER_BATCH) {
    const batch = orders.slice(start, start + ORDER_BATCH);
    const sql = ['begin;'];
    sql.push(`
      drop table if exists pg_temp.demo_seed_customer_map;
      create temp table pg_temp.demo_seed_customer_map as
        select id, email from public.customers
        where tenant_id = ${sqlStr(tenantId)}::uuid
          and email like '%${DEMO_MARKERS.CUSTOMER_EMAIL_DOMAIN}';
      create index on pg_temp.demo_seed_customer_map (email);

      drop table if exists pg_temp.demo_seed_address_map;
      create temp table pg_temp.demo_seed_address_map as
        select ca.customer_id, ca.id as address_id
        from public.customer_addresses ca
        join pg_temp.demo_seed_customer_map cm on cm.id = ca.customer_id;
      create index on pg_temp.demo_seed_address_map (customer_id);
    `);
    for (const o of batch) {
      const cust = customers[o.custIdx];
      const customerSel = `(select id from pg_temp.demo_seed_customer_map where email = ${sqlStr(cust.email)})`;
      const addressSel = `(select address_id from pg_temp.demo_seed_address_map where customer_id = ${customerSel} limit 1)`;
      sql.push(`
        insert into public.restaurant_orders (
          tenant_id, customer_id, delivery_address_id, items,
          subtotal_ron, delivery_fee_ron, total_ron,
          status, payment_status, payment_method, delivery_zone_id, notes,
          created_at, updated_at, review_reminder_sent_at
        )
        select
          ${sqlStr(tenantId)}::uuid,
          ${customerSel},
          ${addressSel},
          ${sqlJson(o.items)},
          ${o.subtotal.toFixed(2)}, ${o.deliveryFee.toFixed(2)}, ${o.total.toFixed(2)},
          ${sqlStr(o.status)}, ${sqlStr(o.paymentStatus)}, ${sqlStr(o.paymentMethod)},
          ${o.zoneId ? sqlStr(o.zoneId) + '::uuid' : 'null::uuid'},
          ${sqlStr(o.notes)},
          ${sqlTs(o.ts)}, ${sqlTs(o.ts)}, ${sqlTs(o.ts)}
        where ${customerSel} is not null
          and not exists (
            select 1 from public.restaurant_orders eo
            where eo.tenant_id = ${sqlStr(tenantId)}::uuid
              and eo.notes = ${sqlStr(o.notes)}
          );
      `);
    }
    sql.push('commit;');
    await runSql(sql.join('\n'));
    inserted += batch.length;
    console.log(`[demo-seed:${segment.slug}]   orders ${inserted}/${orders.length}`);
  }

  // 3. Reviews — ~20% of DELIVERED, weighted: 60% positive (4-5★), 30% neutral (3★), 10% negative (1-2★).
  const reviews = [];
  for (const o of orders) {
    if (o.status !== 'DELIVERED') continue;
    if (rng.next() > 0.2) continue;
    const ratingBucket = rng.weighted([['POS', 60], ['NEU', 30], ['NEG', 10]]);
    let rating, comment;
    if (ratingBucket === 'POS') {
      rating = rng.weighted([[5, 70], [4, 30]]);
      comment = rng.pick(REVIEW_POSITIVE);
    } else if (ratingBucket === 'NEU') {
      rating = 3;
      comment = rng.pick(REVIEW_NEUTRAL);
    } else {
      rating = rng.weighted([[2, 50], [1, 50]]);
      comment = rng.pick(REVIEW_NEGATIVE);
    }
    reviews.push({
      orderIdx: o.idx,
      rating,
      comment,
      ts: new Date(o.ts.getTime() + 24 * 3600 * 1000),
      notes: o.notes,
    });
  }
  const REV_BATCH = 200;
  for (let s = 0; s < reviews.length; s += REV_BATCH) {
    const slice = reviews.slice(s, s + REV_BATCH);
    const sql = ['begin;'];
    for (const r of slice) {
      sql.push(`
        insert into public.restaurant_reviews (tenant_id, order_id, rating, comment, created_at)
        select ${sqlStr(tenantId)}::uuid, o.id, ${r.rating}, ${sqlStr(r.comment)}, ${sqlTs(r.ts)}
        from public.restaurant_orders o
        where o.tenant_id = ${sqlStr(tenantId)}::uuid
          and o.notes = ${sqlStr(r.notes)}
        on conflict (order_id) do nothing;
      `);
    }
    sql.push('commit;');
    await runSql(sql.join('\n'));
  }
  console.log(`[demo-seed:${segment.slug}] reviews seeded (${reviews.length})`);

  // 4. Courier shifts (skip if no couriers).
  if (courierAuthUuids.length > 0) {
    const shifts = [];
    for (let cIdx = 0; cIdx < courierAuthUuids.length; cIdx++) {
      const shiftDays = new Set();
      const targetShifts = Math.min(20, 30);
      while (shiftDays.size < targetShifts) shiftDays.add(rng.randInt(0, 29));
      for (const dayAgo of shiftDays) {
        const isDinner = rng.next() < 0.55;
        const start = new Date(NOW.getTime() - dayAgo * 24 * 3600 * 1000);
        if (isDinner) start.setUTCHours(18, rng.randInt(0, 30), 0, 0);
        else start.setUTCHours(11, rng.randInt(0, 30), 0, 0);
        const durationH = isDinner ? 4 + rng.next() * 1.5 : 4 + rng.next();
        const end = new Date(start.getTime() + durationH * 3600 * 1000);
        if (start > NOW) continue;
        shifts.push({
          courierUuid: courierAuthUuids[cIdx],
          started_at: start,
          ended_at: end > NOW ? null : end,
          status: dayAgo === 0 && end > NOW ? 'ONLINE' : 'OFFLINE',
          last_lat: city.lat + (rng.next() - 0.5) * 0.02,
          last_lng: city.lng + (rng.next() - 0.5) * 0.02,
        });
      }
    }
    const shiftSql = ['begin;'];
    shiftSql.push(`
      delete from public.courier_shifts
      where courier_user_id in (${courierAuthUuids.map((u) => sqlStr(u) + '::uuid').join(', ')});
    `);
    if (shifts.length > 0) {
      const values = shifts.map((s) =>
        `(${sqlStr(s.courierUuid)}::uuid, ${sqlTs(s.started_at)}, ` +
          `${s.ended_at ? sqlTs(s.ended_at) : 'null'}, ` +
          `${sqlStr(s.status)}, ${s.last_lat.toFixed(7)}, ${s.last_lng.toFixed(7)}, ` +
          `${s.ended_at ? sqlTs(s.ended_at) : 'now()'})`
      ).join(',\n  ');
      shiftSql.push(`
        insert into public.courier_shifts (
          courier_user_id, started_at, ended_at, status, last_lat, last_lng, last_seen_at
        ) values
        ${values};
      `);
    }
    shiftSql.push('commit;');
    await runSql(shiftSql.join('\n'));
    console.log(`[demo-seed:${segment.slug}] shifts seeded (${shifts.length})`);

    // 5. Courier orders.
    const PICKUP = {
      line1: `${segment.name} — pickup`,
      lat: city.lat,
      lng: city.lng,
    };
    const courierOrders = [];
    for (const o of orders) {
      if (o.isPickup) continue;
      if (['CANCELLED', 'PENDING', 'CONFIRMED'].includes(o.status)) continue;
      let coStatus;
      if (o.status === 'DELIVERED') coStatus = 'DELIVERED';
      else if (o.status === 'IN_DELIVERY') coStatus = 'IN_TRANSIT';
      else if (['READY', 'PREPARING'].includes(o.status)) coStatus = 'OFFERED';
      else coStatus = 'CREATED';
      const eligibleShifts = shifts.filter((s) =>
        s.started_at <= o.ts && (s.ended_at == null || s.ended_at >= o.ts),
      );
      const courierUuid = eligibleShifts.length > 0
        ? eligibleShifts[rng.randInt(0, eligibleShifts.length - 1)].courierUuid
        : courierAuthUuids[rng.randInt(0, courierAuthUuids.length - 1)];
      courierOrders.push({
        orderIdx: o.idx,
        custIdx: o.custIdx,
        courierUuid,
        status: coStatus,
        ts: o.ts,
        paymentMethod: o.paymentMethod === 'COD' ? 'COD' : 'CARD',
        total: o.total,
        deliveryFee: o.deliveryFee,
      });
    }

    const CO_BATCH = 100;
    let coInserted = 0;
    for (let start = 0; start < courierOrders.length; start += CO_BATCH) {
      const batch = courierOrders.slice(start, start + CO_BATCH);
      const sql = ['begin;'];
      sql.push(`
        drop table if exists pg_temp.demo_seed_customer_map;
        create temp table pg_temp.demo_seed_customer_map as
          select id, email, first_name, phone from public.customers
          where tenant_id = ${sqlStr(tenantId)}::uuid
            and email like '%${DEMO_MARKERS.CUSTOMER_EMAIL_DOMAIN}';
        create index on pg_temp.demo_seed_customer_map (email);

        drop table if exists pg_temp.demo_seed_address_map;
        create temp table pg_temp.demo_seed_address_map as
          select ca.customer_id, ca.line1, ca.latitude, ca.longitude
          from public.customer_addresses ca
          join pg_temp.demo_seed_customer_map cm on cm.id = ca.customer_id;
        create index on pg_temp.demo_seed_address_map (customer_id);
      `);
      const rows = [];
      for (const co of batch) {
        const cust = customers[co.custIdx];
        // Track token includes segment slug to keep it globally unique.
        const sourceOrderId = `${DEMO_MARKERS.COURIER_ORDER_PREFIX}${segment.slug}-${String(co.orderIdx).padStart(4, '0')}`;
        const trackToken = `demo-${segment.slug}-${String(co.orderIdx).padStart(4, '0')}`;
        rows.push(
          `('HIR_TENANT', ${sqlStr(tenantId)}::uuid, ${sqlStr(sourceOrderId)}, ` +
            `(select first_name from pg_temp.demo_seed_customer_map where email = ${sqlStr(cust.email)}), ` +
            `(select phone from pg_temp.demo_seed_customer_map where email = ${sqlStr(cust.email)}), ` +
            `${sqlStr(PICKUP.line1)}, ${PICKUP.lat}, ${PICKUP.lng}, ` +
            `(select line1 from pg_temp.demo_seed_address_map where customer_id = (select id from pg_temp.demo_seed_customer_map where email = ${sqlStr(cust.email)}) limit 1), ` +
            `(select latitude from pg_temp.demo_seed_address_map where customer_id = (select id from pg_temp.demo_seed_customer_map where email = ${sqlStr(cust.email)}) limit 1), ` +
            `(select longitude from pg_temp.demo_seed_address_map where customer_id = (select id from pg_temp.demo_seed_customer_map where email = ${sqlStr(cust.email)}) limit 1), ` +
            `'[]'::jsonb, ${co.total.toFixed(2)}, ${co.deliveryFee.toFixed(2)}, ${sqlStr(co.paymentMethod)}, ` +
            `${sqlStr(co.status)}, ${sqlStr(co.courierUuid)}::uuid, ${sqlStr(trackToken)}, ` +
            `${sqlStr(fleetId)}::uuid, 'restaurant', ` +
            `${sqlTs(co.ts)}, ${sqlTs(co.ts)})`
        );
      }
      sql.push(`
        insert into public.courier_orders (
          source_type, source_tenant_id, source_order_id,
          customer_first_name, customer_phone,
          pickup_line1, pickup_lat, pickup_lng,
          dropoff_line1, dropoff_lat, dropoff_lng,
          items, total_ron, delivery_fee_ron, payment_method,
          status, assigned_courier_user_id, public_track_token,
          fleet_id, vertical,
          created_at, updated_at
        ) values
        ${rows.join(',\n    ')}
        on conflict (public_track_token) do nothing;
      `);
      sql.push('commit;');
      await runSql(sql.join('\n'));
      coInserted += batch.length;
      console.log(`[demo-seed:${segment.slug}]   courier_orders ${coInserted}/${courierOrders.length}`);
    }
  }
}

function hashSeed(slug) {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}

// ---- buildTenantCleanupSql ------------------------------------------------
// Emit FK-safe DELETE statements for a single demo tenant. Used both by
// --reset and by cleanup-all-segments.mjs.
export function buildTenantCleanupSql(slug) {
  return `
    do $cleanup$
    declare
      v_tenant uuid;
      v_courier_uids uuid[];
    begin
      select id into v_tenant from public.tenants where slug = ${sqlStr(slug)} limit 1;
      if v_tenant is null then
        raise notice 'tenant % not found, nothing to clean', ${sqlStr(slug)};
        return;
      end if;
      -- Courier user_ids attached to this tenant via courier_orders' source_tenant_id
      -- AND their phone is a demo phone. We can't strictly scope auth.users by
      -- tenant (couriers are not tenant-bound), so we filter by phone marker.
      select array_agg(distinct cp.user_id)
      into v_courier_uids
      from public.courier_profiles cp
      where cp.phone like '${DEMO_MARKERS.COURIER_PHONE_PREFIX}%'
        and exists (
          select 1 from public.courier_orders co
          where co.assigned_courier_user_id = cp.user_id
            and co.source_tenant_id = v_tenant
        );

      delete from public.restaurant_reviews
        where tenant_id = v_tenant
          and order_id in (
            select id from public.restaurant_orders
            where tenant_id = v_tenant
              and notes like '${DEMO_MARKERS.ORDER_NOTES_PREFIX}%'
          );
      delete from public.restaurant_orders
        where tenant_id = v_tenant
          and notes like '${DEMO_MARKERS.ORDER_NOTES_PREFIX}%';
      delete from public.customer_addresses
        where customer_id in (
          select id from public.customers
          where tenant_id = v_tenant
            and email like '%${DEMO_MARKERS.CUSTOMER_EMAIL_DOMAIN}'
        );
      delete from public.customers
        where tenant_id = v_tenant
          and email like '%${DEMO_MARKERS.CUSTOMER_EMAIL_DOMAIN}';
      delete from public.courier_orders
        where source_tenant_id = v_tenant
          and source_order_id like '${DEMO_MARKERS.COURIER_ORDER_PREFIX}%';
      if v_courier_uids is not null then
        delete from public.courier_shifts where courier_user_id = any(v_courier_uids);
        delete from public.courier_profiles where user_id = any(v_courier_uids);
        delete from auth.users
          where id = any(v_courier_uids)
            and email like '%${DEMO_MARKERS.COURIER_AUTH_EMAIL_DOMAIN}';
      end if;
      delete from public.reservation_settings where tenant_id = v_tenant;
      delete from public.delivery_zones where tenant_id = v_tenant;
      delete from public.restaurant_menu_items where tenant_id = v_tenant;
      delete from public.restaurant_menu_categories where tenant_id = v_tenant;
      -- Finally drop the tenant itself (only if its slug starts with 'demo-' AND
      -- settings.demo_seed = true — defensive double-check).
      delete from public.tenants
        where id = v_tenant
          and slug like 'demo-%'
          and (settings ->> 'demo_seed')::boolean = true;
    end
    $cleanup$;
  `;
}
