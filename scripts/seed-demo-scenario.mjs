// HIR Restaurant Suite — demo-tenant scenario seeder.
//
// Populates a tenant with 30 days of plausible activity (menu, customers,
// orders, reviews, reservations, one promo code) so a sales prospect sees
// real numbers on KPIs / orders / reviews / reservations dashboards.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=... node scripts/seed-demo-scenario.mjs --tenant restaurant-demo
//   SUPABASE_ACCESS_TOKEN=... node scripts/seed-demo-scenario.mjs --tenant-id <uuid> --reset
//
// Required env:
//   SUPABASE_ACCESS_TOKEN   Supabase Management API token (for SQL endpoint).
//   SUPABASE_PROJECT_REF    optional, defaults to qfmeojeipncuxeltnvab (prod
//                           ref — production guard requires --allow-prod).
//
// Flags:
//   --tenant <slug>         resolve tenant_id by tenants.slug
//   --tenant-id <uuid>      target a tenant directly
//   --reset                 wipe existing demo data first (orders, reviews,
//                           customers, menu, reservations, promo codes)
//                           scoped to the tenant
//   --allow-prod            allow running against the prod project
//
// Exit code: 0 on success, 1 on any DB error or bad input.

import { argv, env, exit, stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

const PROD_PROJECT_REF = 'qfmeojeipncuxeltnvab';
const PROJECT_REF = env.SUPABASE_PROJECT_REF ?? PROD_PROJECT_REF;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;

// ---- arg parsing -----------------------------------------------------------
function parseArgs() {
  const args = { reset: false, allowProd: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tenant') args.tenant = argv[++i];
    else if (a === '--tenant-id') args.tenantId = argv[++i];
    else if (a === '--reset') args.reset = true;
    else if (a === '--allow-prod') args.allowProd = true;
    else if (a === '--help' || a === '-h') {
      printUsage();
      exit(0);
    } else {
      console.error(`unknown arg: ${a}`);
      printUsage();
      exit(2);
    }
  }
  if (!args.tenant && !args.tenantId) {
    console.error('error: --tenant <slug> or --tenant-id <uuid> required');
    printUsage();
    exit(2);
  }
  return args;
}

function printUsage() {
  console.error(
    'usage: node scripts/seed-demo-scenario.mjs ' +
      '(--tenant <slug> | --tenant-id <uuid>) [--reset] [--allow-prod]',
  );
}

// ---- supabase mgmt-api client ---------------------------------------------
const DRY_RUN = env.SEED_DEMO_DRY_RUN === '1';
async function runSql(query) {
  if (DRY_RUN) {
    // In dry-run mode emit each statement to stdout, return a stub that the
    // tenant lookup + counts can read without exploding.
    console.log('--- DRY RUN SQL ---');
    console.log(query);
    if (/from public\.tenants/i.test(query)) {
      return [{ id: '00000000-0000-0000-0000-000000000000', name: 'Dry Run Tenant', slug: 'dry-run' }];
    }
    return [{}];
  }
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    console.error(`[seed-demo] SQL failed (HTTP ${res.status}):`);
    console.error(text);
    exit(1);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---- deterministic RNG (mulberry32) ---------------------------------------
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(42);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const randInt = (lo, hi) => Math.floor(rng() * (hi - lo + 1)) + lo;
const weighted = (pairs) => {
  const total = pairs.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [v, w] of pairs) {
    if ((r -= w) <= 0) return v;
  }
  return pairs[pairs.length - 1][0];
};

// ---- data pools ------------------------------------------------------------
const FIRST_NAMES = [
  'Andrei', 'Maria', 'Mihai', 'Elena', 'Cristian',
  'Ioana', 'Radu', 'Alina', 'Stefan', 'Ana',
  'Bogdan', 'Diana',
];
const LAST_NAMES = [
  'Popescu', 'Ionescu', 'Stoica', 'Dumitrescu', 'Constantinescu',
  'Marinescu', 'Georgescu', 'Stan', 'Munteanu', 'Radu',
  'Popa', 'Diaconu',
];

const MENU = [
  { cat: 'Pizza',   name: 'Pizza Margherita',         price: 32.0, desc: 'Sos roșii, mozzarella, busuioc proaspăt' },
  { cat: 'Pizza',   name: 'Pizza Quattro Stagioni',   price: 38.0, desc: 'Șuncă, ciuperci, anghinare, măsline' },
  { cat: 'Pizza',   name: 'Pizza Diavola',            price: 36.0, desc: 'Salam picant, mozzarella, ardei iute' },
  { cat: 'Paste',   name: 'Spaghetti Carbonara',      price: 32.0, desc: 'Pancetta, gălbenuș, parmezan, piper negru' },
  { cat: 'Paste',   name: 'Penne Arrabbiata',         price: 28.0, desc: 'Sos roșii picant, usturoi, ardei iute' },
  { cat: 'Paste',   name: 'Tagliatelle Bolognese',    price: 34.0, desc: 'Sos de carne de vită, parmezan' },
  { cat: 'Băuturi', name: 'Coca-Cola 0.5L',           price: 8.0,  desc: null },
  { cat: 'Băuturi', name: 'Apă plată 0.5L',           price: 6.0,  desc: null },
];

const REVIEW_COMMENTS = [
  'Foarte bun, recomand!',
  'Cald și gustos, livrare rapidă.',
  'Aștept altă comandă, ne-a plăcut tuturor.',
  'Mâncare proaspătă și porții generoase.',
  'Curierul a fost foarte amabil.',
  'Comandăm săptămânal, nu ne-au dezamăgit niciodată.',
  'Bine, dar ar putea fi mai cald la livrare.',
  'OK, cam scump pentru cantitate.',
  'Așteptat prea mult, mâncarea era rece.',
];

// ---- SQL builder helpers --------------------------------------------------
function sqlStr(s) {
  if (s === null || s === undefined) return 'null';
  return `'${String(s).replace(/'/g, "''")}'`;
}
function sqlJson(o) {
  return `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
}

// ---- main ------------------------------------------------------------------
const args = parseArgs();

if (!TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN not set. Export it before running this script.');
  exit(2);
}

// Production guard.
if (PROJECT_REF === PROD_PROJECT_REF && !args.allowProd) {
  console.error(
    `[seed-demo] refusing to run against prod project (${PROJECT_REF}). ` +
      'Pass --allow-prod to override (you will be asked to confirm).',
  );
  exit(2);
}
if (PROJECT_REF === PROD_PROJECT_REF && args.allowProd) {
  const rl = createInterface({ input: stdin, output: stdout });
  const ans = await rl.question(
    `[seed-demo] About to seed demo data into PRODUCTION (${PROJECT_REF}). Type "yes" to continue: `,
  );
  rl.close();
  if (ans.trim() !== 'yes') {
    console.error('[seed-demo] aborted.');
    exit(1);
  }
}

// 1. Resolve tenant.
const tenantWhere = args.tenantId
  ? `id = ${sqlStr(args.tenantId)}::uuid`
  : `slug = ${sqlStr(args.tenant)}`;
const tenantRes = await runSql(
  `select id, name, slug from public.tenants where ${tenantWhere} limit 1;`,
);
const tenantRow = Array.isArray(tenantRes) ? tenantRes[0] : null;
if (!tenantRow) {
  console.error(`[seed-demo] tenant not found (${args.tenantId ?? args.tenant})`);
  exit(1);
}
const tenantId = tenantRow.id;
console.log(`[seed-demo] target tenant: ${tenantRow.name} (${tenantRow.slug}) ${tenantId}`);

// 2. Optional reset.
if (args.reset) {
  console.log('[seed-demo] --reset: wiping existing demo data...');
  // FK-safe order: redemptions/reviews/reservations -> orders -> menu items -> categories -> customers/promos.
  await runSql(`
    begin;
    delete from public.promo_redemptions
      where promo_code_id in (select id from public.promo_codes where tenant_id = ${sqlStr(tenantId)}::uuid);
    delete from public.restaurant_reviews where tenant_id = ${sqlStr(tenantId)}::uuid;
    delete from public.reservations       where tenant_id = ${sqlStr(tenantId)}::uuid;
    delete from public.restaurant_orders  where tenant_id = ${sqlStr(tenantId)}::uuid;
    delete from public.restaurant_menu_items      where tenant_id = ${sqlStr(tenantId)}::uuid;
    delete from public.restaurant_menu_categories where tenant_id = ${sqlStr(tenantId)}::uuid;
    delete from public.customers          where tenant_id = ${sqlStr(tenantId)}::uuid;
    delete from public.promo_codes        where tenant_id = ${sqlStr(tenantId)}::uuid;
    commit;
  `);
}

// 3. Inspect existing state for idempotence.
const existing = await runSql(`
  select
    (select count(*)::int from public.restaurant_menu_items where tenant_id = ${sqlStr(tenantId)}::uuid) as menu,
    (select count(*)::int from public.customers              where tenant_id = ${sqlStr(tenantId)}::uuid) as customers,
    (select count(*)::int from public.restaurant_orders      where tenant_id = ${sqlStr(tenantId)}::uuid
       and created_at > now() - interval '30 days') as recent_orders,
    (select count(*)::int from public.restaurant_reviews     where tenant_id = ${sqlStr(tenantId)}::uuid) as reviews,
    (select count(*)::int from public.reservations           where tenant_id = ${sqlStr(tenantId)}::uuid
       and requested_at > now()) as upcoming_reservations,
    (select count(*)::int from public.promo_codes            where tenant_id = ${sqlStr(tenantId)}::uuid
       and code ilike 'demo10') as promo;
`);
const counts = Array.isArray(existing) ? existing[0] : {};
const skipMenu     = counts.menu >= 8;
const skipOrders   = counts.recent_orders >= 30;
const skipReviews  = counts.reviews >= 20;
const skipResv     = counts.upcoming_reservations >= 6;
const skipPromo    = counts.promo > 0;
const skipCustomers = counts.customers >= 10;

// 4. Build the seed SQL in one PL/pgSQL DO block so we can use locals
//    (category ids, item ids, customer ids) without round-trips.
const sql = [];
sql.push('begin;');
sql.push('do $seed$');
sql.push('declare');
sql.push('  v_tenant uuid := ' + sqlStr(tenantId) + '::uuid;');
sql.push('  v_cat_pizza uuid; v_cat_paste uuid; v_cat_drinks uuid;');
sql.push('  v_item_ids uuid[]; v_item_names text[]; v_item_prices numeric[];');
sql.push('  v_customer_ids uuid[];');
sql.push('  v_order_id uuid; v_promo_id uuid;');
sql.push('begin');

// --- 4a. Menu (only if no menu yet).
if (!skipMenu) {
  sql.push(`  insert into public.restaurant_menu_categories (tenant_id, name, sort_order) values
    (v_tenant, 'Pizza', 0), (v_tenant, 'Paste', 1), (v_tenant, 'Băuturi', 2)
    on conflict do nothing;`);
  sql.push(`  select id into v_cat_pizza  from public.restaurant_menu_categories where tenant_id = v_tenant and name = 'Pizza'   limit 1;`);
  sql.push(`  select id into v_cat_paste  from public.restaurant_menu_categories where tenant_id = v_tenant and name = 'Paste'   limit 1;`);
  sql.push(`  select id into v_cat_drinks from public.restaurant_menu_categories where tenant_id = v_tenant and name = 'Băuturi' limit 1;`);
  let sort = 0;
  for (const m of MENU) {
    const catVar = m.cat === 'Pizza' ? 'v_cat_pizza' : m.cat === 'Paste' ? 'v_cat_paste' : 'v_cat_drinks';
    sql.push(`  insert into public.restaurant_menu_items (tenant_id, category_id, name, description, price_ron, sort_order, is_available)
    values (v_tenant, ${catVar}, ${sqlStr(m.name)}, ${sqlStr(m.desc)}, ${m.price.toFixed(2)}, ${sort++}, true);`);
  }
}

// --- 4b. Cache item ids/names/prices into arrays for order item snapshots.
sql.push(`  select array_agg(id), array_agg(name), array_agg(price_ron)
    into v_item_ids, v_item_names, v_item_prices
    from (select id, name, price_ron from public.restaurant_menu_items where tenant_id = v_tenant order by created_at limit 8) s;`);
sql.push(`  if v_item_ids is null or array_length(v_item_ids, 1) is null then
    raise notice 'no menu items for tenant %, skipping orders', v_tenant; return;
  end if;`);

// --- 4c. Customers.
const customerCount = skipCustomers ? 0 : 12;
if (customerCount > 0) {
  for (let i = 0; i < customerCount; i++) {
    const fn = FIRST_NAMES[i % FIRST_NAMES.length];
    const ln = LAST_NAMES[i % LAST_NAMES.length];
    const phone = `+40 7${randInt(20, 79)}${String(randInt(0, 999999)).padStart(6, '0')}`;
    const email = `${fn.toLowerCase()}.${ln.toLowerCase()}+demo${i}@example.com`;
    sql.push(`  insert into public.customers (tenant_id, first_name, last_name, phone, email)
    values (v_tenant, ${sqlStr(fn)}, ${sqlStr(ln)}, ${sqlStr(phone)}, ${sqlStr(email)});`);
  }
}
sql.push(`  select array_agg(id) into v_customer_ids from (
    select id from public.customers where tenant_id = v_tenant order by created_at desc limit 12
  ) s;`);

// --- 4d. Promo code.
if (!skipPromo) {
  sql.push(`  insert into public.promo_codes (tenant_id, code, kind, value_int, is_active)
    values (v_tenant, 'DEMO10', 'PERCENT', 10, true)
    on conflict do nothing;`);
}

// --- 4e. Orders + reviews. Build deterministically in JS, emit SQL.
const ordersToCreate = [];
if (!skipOrders) {
  // 45 orders distributed across 30 days. Status mix: 70% DELIVERED+PAID,
  // 10% CANCELLED, 5% PENDING (today), 10% PREPARING/IN_DELIVERY (today),
  // 5% READY (today).
  const dayBuckets = []; // 45 orders, 0 = today, 30 = oldest
  for (let i = 0; i < 45; i++) {
    // First 6 are "live today" (PENDING/PREPARING/IN_DELIVERY/READY); rest
    // are historical, spread 1..30 days back.
    if (i < 6) dayBuckets.push(0);
    else dayBuckets.push(randInt(1, 29));
  }

  for (let i = 0; i < 45; i++) {
    const ago = dayBuckets[i];
    let status, payment;
    if (ago === 0 && i < 2) { status = 'PENDING'; payment = 'UNPAID'; }
    else if (ago === 0 && i < 4) { status = 'PREPARING'; payment = 'PAID'; }
    else if (ago === 0 && i === 4) { status = 'IN_DELIVERY'; payment = 'PAID'; }
    else if (ago === 0 && i === 5) { status = 'READY'; payment = 'PAID'; }
    else {
      // historical: 70% DELIVERED, 10% CANCELLED (relative to historical)
      status = weighted([
        ['DELIVERED', 87],
        ['CANCELLED', 13],
      ]);
      payment = status === 'DELIVERED' ? 'PAID' : weighted([['UNPAID', 70], ['REFUNDED', 30]]);
    }

    // 80/20 delivery vs pickup — pickup: delivery_fee = 0
    const isPickup = rng() < 0.2;
    // 1-3 line items
    const itemCount = randInt(1, 3);
    const lineItems = [];
    let subtotal = 0;
    for (let k = 0; k < itemCount; k++) {
      const idx = randInt(0, MENU.length - 1);
      const qty = weighted([[1, 70], [2, 25], [3, 5]]);
      const price = MENU[idx].price;
      subtotal += price * qty;
      lineItems.push({
        // name + price are snapshot strings; itemId resolved server-side at SQL time
        name: MENU[idx].name,
        quantity: qty,
        priceRon: price,
        modifiers: [],
      });
    }
    // Clamp/scale to 25-180 RON
    if (subtotal < 25) {
      // bump qty on first line until subtotal >= 25
      while (subtotal < 25) {
        lineItems[0].quantity += 1;
        subtotal += lineItems[0].priceRon;
      }
    }
    if (subtotal > 180) subtotal = 180;
    const deliveryFee = isPickup ? 0 : weighted([[10, 50], [12, 30], [15, 20]]);
    const total = subtotal + deliveryFee;

    // timestamp: spread across the day
    const hoursOffset = ago === 0 ? randInt(0, 5) : randInt(0, 23);
    const minutesOffset = randInt(0, 59);
    const tsExpr = `now() - interval '${ago} days' - interval '${hoursOffset} hours' - interval '${minutesOffset} minutes'`;

    ordersToCreate.push({
      idx: i,
      status,
      payment,
      subtotal: subtotal.toFixed(2),
      deliveryFee: deliveryFee.toFixed(2),
      total: total.toFixed(2),
      items: lineItems,
      tsExpr,
      ago,
    });
  }

  // Emit SQL for orders.
  ordersToCreate.forEach((o) => {
    const customerExpr = `v_customer_ids[((${o.idx} % array_length(v_customer_ids, 1)) + 1)]`;
    sql.push(`  insert into public.restaurant_orders (
      tenant_id, customer_id, items, subtotal_ron, delivery_fee_ron, total_ron,
      status, payment_status, created_at, updated_at
    ) values (
      v_tenant, ${customerExpr}, ${sqlJson(o.items)},
      ${o.subtotal}, ${o.deliveryFee}, ${o.total},
      ${sqlStr(o.status)}, ${sqlStr(o.payment)},
      ${o.tsExpr}, ${o.tsExpr}
    ) returning id into v_order_id;`);

    // Reviews: ~60% of DELIVERED orders
    if (!skipReviews && o.status === 'DELIVERED' && rng() < 0.6) {
      const rating = weighted([[5, 45], [4, 25], [3, 20], [2, 7], [1, 3]]);
      const comment = pick(REVIEW_COMMENTS);
      sql.push(`  insert into public.restaurant_reviews (tenant_id, order_id, rating, comment, created_at)
      values (v_tenant, v_order_id, ${rating}, ${sqlStr(comment)}, ${o.tsExpr} + interval '1 day');`);
    }
  });
}

// --- 4f. Reservations.
if (!skipResv) {
  for (let i = 0; i < 12; i++) {
    const daysAhead = randInt(0, 13);
    const hour = randInt(19, 21);
    const minute = pick([0, 15, 30, 45]);
    const partySize = randInt(2, 6);
    const fn = FIRST_NAMES[(i + 3) % FIRST_NAMES.length];
    const phone = `+40 7${randInt(20, 79)}${String(randInt(0, 999999)).padStart(6, '0')}`;
    // Mostly CONFIRMED. Some REQUESTED for next 48h to populate the
    // owner's "actions queue".
    const status =
      daysAhead < 2
        ? weighted([['REQUESTED', 60], ['CONFIRMED', 40]])
        : weighted([['CONFIRMED', 80], ['REQUESTED', 20]]);
    const tsExpr =
      `(date_trunc('day', now()) + interval '${daysAhead} days' + interval '${hour} hours' + interval '${minute} minutes')`;
    sql.push(`  insert into public.reservations (
      tenant_id, customer_first_name, customer_phone, party_size, requested_at, status
    ) values (
      v_tenant, ${sqlStr(fn)}, ${sqlStr(phone)}, ${partySize}, ${tsExpr}, ${sqlStr(status)}
    );`);
  }
  // Make sure reservation_settings row exists so the dashboard's "enabled"
  // check doesn't hide the data. Don't change is_enabled if a row already
  // exists (operator may have intentionally left it off).
  sql.push(`  insert into public.reservation_settings (tenant_id, is_enabled)
    values (v_tenant, true)
    on conflict (tenant_id) do nothing;`);
}

sql.push('end');
sql.push('$seed$;');
sql.push('commit;');

const seedSql = sql.join('\n');
await runSql(seedSql);

// 5. Final counts for summary.
const summary = await runSql(`
  select
    (select count(*)::int from public.restaurant_orders      where tenant_id = ${sqlStr(tenantId)}::uuid) as orders,
    (select count(*)::int from public.restaurant_reviews     where tenant_id = ${sqlStr(tenantId)}::uuid) as reviews,
    (select count(*)::int from public.reservations           where tenant_id = ${sqlStr(tenantId)}::uuid) as reservations,
    (select count(*)::int from public.customers              where tenant_id = ${sqlStr(tenantId)}::uuid) as customers,
    (select count(*)::int from public.restaurant_menu_items  where tenant_id = ${sqlStr(tenantId)}::uuid) as menu;
`);
const s = Array.isArray(summary) ? summary[0] : {};
const skipped = [
  skipMenu && 'menu',
  skipOrders && 'orders',
  skipReviews && 'reviews',
  skipResv && 'reservations',
  skipPromo && 'promo',
  skipCustomers && 'customers',
].filter(Boolean);

console.log(
  `[seed-demo] Seeded ${s.orders} orders, ${s.reviews} reviews, ` +
    `${s.reservations} reservations, ${s.customers} customers, ` +
    `${s.menu} menu items into ${tenantRow.name}.`,
);
if (skipped.length > 0) {
  console.log(`[seed-demo] (idempotent skip — already had data: ${skipped.join(', ')})`);
}
exit(0);
