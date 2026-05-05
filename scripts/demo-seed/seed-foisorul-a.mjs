// HIR Restaurant Suite — FOISORUL A demo-data seeder.
//
// Populates the FOISORUL A tenant (slug `foisorul-a`) with 30 days of
// realistic-looking activity so /dashboard and /fleet show meaningful
// numbers + charts during the București pitch tour:
//   - ~250 unique customers with addresses
//   - ~700 orders across 30 days (lunch + dinner peaks, weekend bumps)
//   - ~80 courier shifts split across 4 demo couriers
//   - ~520 courier_orders (one per non-cancelled non-pickup restaurant order)
//   - ~140 reviews on delivered orders (mostly 4-5 stars)
//   - 4 PENDING affiliate applications
//
// Idempotent: every row is tagged with a demo marker (see common.mjs ->
// DEMO_MARKERS). Re-running the script no-ops if the tenant already has the
// expected demo volume.
//
// Hard constraints:
//   - TOUCHES ONLY the tenant with slug `foisorul-a`. No other tenant is
//     ever written to.
//   - Phone numbers are obviously fake (`+40700000NNN` for customers,
//     `+4070099NN` for couriers) and emails use `@hir-demo.ro`. No risk of
//     accidentally pinging a real human.
//   - Orders are inserted with payment_status already set (no UPDATE), so
//     the notify-new-order + notify-customer-status triggers (which fire on
//     UPDATE) never run.
//   - review_reminder_sent_at is set to created_at on every demo order, so
//     the hourly review-reminder cron skips them too.
//   - Companion cleanup: scripts/demo-seed/cleanup-foisorul-a.mjs.
//
// Usage:
//   node scripts/demo-seed/seed-foisorul-a.mjs --dry-run    # print SQL only
//   node scripts/demo-seed/seed-foisorul-a.mjs              # seed against
//                                                            # SUPABASE_PROJECT_REF
//   node scripts/demo-seed/seed-foisorul-a.mjs --reset      # cleanup + reseed
//
// Required env (or vault at ~/.hir/secrets.json):
//   SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_PAT
//   (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY only needed if you switch the
//    runner away from the Management API — currently unused.)

import { argv, exit } from 'node:process';
import {
  loadSecrets,
  makeSqlRunner,
  makeRng,
  sqlStr,
  sqlJson,
  sqlTs,
  DEMO_MARKERS,
} from './common.mjs';

const TARGET_SLUG = 'foisorul-a';

// ---- arg parsing -----------------------------------------------------------
function parseArgs() {
  const args = { dryRun: false, reset: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--reset') args.reset = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        'usage: node scripts/demo-seed/seed-foisorul-a.mjs [--dry-run] [--reset]',
      );
      exit(0);
    } else {
      console.error(`unknown arg: ${a}`);
      exit(2);
    }
  }
  return args;
}

// ---- data pools ------------------------------------------------------------
const FIRST_NAMES = [
  'Andrei', 'Maria', 'Mihai', 'Elena', 'Cristian', 'Ioana', 'Radu', 'Alina',
  'Stefan', 'Ana', 'Bogdan', 'Diana', 'Catalin', 'Roxana', 'Vlad', 'Simona',
  'George', 'Adriana', 'Razvan', 'Iulia', 'Daniel', 'Carmen', 'Sebastian',
  'Mihaela', 'Alexandru', 'Gabriela', 'Florin', 'Cristina', 'Adrian',
  'Andreea',
];

const LAST_NAMES = [
  'Popescu', 'Ionescu', 'Stoica', 'Dumitrescu', 'Constantinescu', 'Marinescu',
  'Georgescu', 'Stan', 'Munteanu', 'Radu', 'Popa', 'Diaconu', 'Nistor',
  'Tudor', 'Pavel', 'Cojocaru', 'Niculescu', 'Iordan', 'Voicu', 'Lazar',
];

// Brașov streets — realistic-looking pickup addresses.
const BRASOV_STREETS = [
  'Str. Republicii', 'Bd. Eroilor', 'Str. Lungă', 'Str. Mureșenilor',
  'Bd. 15 Noiembrie', 'Str. De Mijloc', 'Str. Castelului', 'Bd. Saturn',
  'Str. Calea București', 'Bd. Alexandru Vlahuță', 'Str. Toamnei',
  'Bd. Griviței', 'Str. Carpaților', 'Str. Iuliu Maniu', 'Str. Postăvarului',
  'Bd. Gării', 'Str. Brașovul Vechi', 'Str. Memorandului', 'Bd. Iuliu Maniu',
  'Str. Olteț',
];

// Restaurant pickup point (FOISORUL A — approximate Brașov center).
const PICKUP = {
  line1: 'Str. Republicii nr. 62, FOISORUL A',
  lat: 45.6427,
  lng: 25.5887,
};

const REVIEW_COMMENTS_POSITIVE = [
  'Mâncare excelentă, recomand cu căldură!',
  'Cea mai bună grătar din Brașov, livrare rapidă.',
  'Comandăm săptămânal — porții generoase și gust autentic.',
  'Curierul a fost super amabil, totul a sosit cald.',
  'Vinul de la Cricova a făcut diferența. Felicitări!',
  'Carnea era perfect făcută, sosurile la fel.',
  'Mușchiul de vită — minunat! Mulțumim.',
  'Foarte rapid, totul perfect ambalat.',
  'Burgerii sunt o nebunie, vom reveni!',
  'Pizza a fost crocantă chiar și după 25 de minute pe drum.',
];

const REVIEW_COMMENTS_NEUTRAL = [
  'Bine, dar a sosit cam rece. Poate ar trebui pungi termice mai bune.',
  'OK în general, dar livrarea a durat puțin mai mult decât promis.',
  'Mâncarea bună, dar lipseau sosurile pe care le-am cerut.',
  'Decent, dar prețul mi se pare ușor ridicat pentru porții.',
];

const COURIER_NAMES = [
  { first: 'Vasile', last: 'Tudor', vehicle: 'SCOOTER' },
  { first: 'Marius', last: 'Cojocaru', vehicle: 'CAR' },
  { first: 'Ionut', last: 'Popa', vehicle: 'SCOOTER' },
  { first: 'Cristian', last: 'Lazar', vehicle: 'BIKE' },
];

const AFFILIATE_APPS = [
  {
    full_name: 'Roxana Foodie',
    audience_type: 'CREATOR',
    audience_size: 18000,
    channels: ['INSTAGRAM', 'TIKTOK'],
    pitch:
      'Sunt creatoare de conținut food în Brașov, postez săptămânal review-uri restaurante. Aș dori să promovez HIR în comunitatea mea de 18k urmăritori.',
  },
  {
    full_name: 'Andrei Brașovianul',
    audience_type: 'BLOGGER',
    audience_size: 5500,
    channels: ['BLOG', 'FACEBOOK'],
    pitch:
      'Blog local Brașov („brasovianul.ro") cu 5.5k cititori/lună. Publicăm ghiduri culinare lunare. Vrem să integrăm HIR ca soluție recomandată restaurantelor partenere.',
  },
  {
    full_name: 'Daniela Consultant HoReCa',
    audience_type: 'CONSULTANT',
    audience_size: null,
    channels: ['LINKEDIN', 'EMAIL'],
    pitch:
      'Consult restaurante mici/medii în tranziția digitală. Am ~30 clienți activi în RO. HIR pare exact ce le recomand pentru independență față de Wolt/Glovo.',
  },
  {
    full_name: 'Foisorul B (tenant existent)',
    audience_type: 'EXISTING_TENANT',
    audience_size: null,
    channels: ['WORD_OF_MOUTH'],
    pitch:
      'Suntem deja pe HIR (foisorul-a, sora restaurantului nostru). Vrem să recomandăm soluția altor 3-4 restaurante locale cu care suntem în relație apropiată.',
  },
];

// ---- main ------------------------------------------------------------------
const args = parseArgs();
const secrets = loadSecrets();
const runSql = await makeSqlRunner(secrets, { dryRun: args.dryRun });

console.log(
  `[seed-foisorul-a] target project ref: ${secrets.SUPABASE_PROJECT_REF}` +
    (args.dryRun ? ' (DRY-RUN)' : ''),
);

// 1. Resolve tenant.
const tenantRows = await runSql(
  `select id, slug, name, status from public.tenants where slug = ${sqlStr(TARGET_SLUG)} limit 1;`,
);
const tenant = Array.isArray(tenantRows) ? tenantRows[0] : null;
if (!tenant) {
  console.error(
    `[seed-foisorul-a] tenant slug=${TARGET_SLUG} not found. Aborting.`,
  );
  exit(1);
}
console.log(
  `[seed-foisorul-a] tenant: ${tenant.name} (${tenant.slug}) ${tenant.id} status=${tenant.status}`,
);
const TENANT_ID = tenant.id;

// 2. Optional reset.
if (args.reset && !args.dryRun) {
  console.log('[seed-foisorul-a] --reset: invoking cleanup first');
  // Lightweight inline cleanup that mirrors cleanup-foisorul-a.mjs.
  await runSql(buildCleanupSql(TENANT_ID));
}

// 3. Snapshot existing demo volume for idempotency.
const snap = await runSql(`
  select
    (select count(*)::int from public.customers
       where tenant_id = ${sqlStr(TENANT_ID)}::uuid
         and email like '%${DEMO_MARKERS.CUSTOMER_EMAIL_DOMAIN}') as demo_customers,
    (select count(*)::int from public.restaurant_orders
       where tenant_id = ${sqlStr(TENANT_ID)}::uuid
         and notes like '${DEMO_MARKERS.ORDER_NOTES_PREFIX}%') as demo_orders,
    (select count(*)::int from public.restaurant_menu_items
       where tenant_id = ${sqlStr(TENANT_ID)}::uuid
         and is_available = true) as menu_items,
    (select count(*)::int from public.delivery_zones
       where tenant_id = ${sqlStr(TENANT_ID)}::uuid
         and is_active = true) as zones,
    (select count(*)::int from public.affiliate_applications
       where email like '%${DEMO_MARKERS.AFFILIATE_EMAIL_DOMAIN}') as demo_affiliate_apps;
`);
const counts = Array.isArray(snap) ? snap[0] : {};
console.log(
  `[seed-foisorul-a] current demo state: ` +
    `customers=${counts.demo_customers ?? 0} orders=${counts.demo_orders ?? 0} ` +
    `menu_items=${counts.menu_items ?? 0} zones=${counts.zones ?? 0} ` +
    `affiliate_apps=${counts.demo_affiliate_apps ?? 0}`,
);

const TARGET_ORDERS = 700;
if ((counts.demo_orders ?? 0) >= TARGET_ORDERS - 50) {
  console.log(
    `[seed-foisorul-a] already at/near target (${counts.demo_orders}/${TARGET_ORDERS}). ` +
      'Pass --reset to wipe + reseed. No changes made.',
  );
  exit(0);
}
if ((counts.menu_items ?? 0) < 20) {
  console.error(
    `[seed-foisorul-a] tenant has only ${counts.menu_items} available menu items — ` +
      'seed needs ≥20 items to build realistic baskets. Aborting.',
  );
  exit(1);
}
if ((counts.zones ?? 0) < 1) {
  console.error(
    '[seed-foisorul-a] tenant has no active delivery zones — seed needs ≥1. Aborting.',
  );
  exit(1);
}

// 4. Pull menu items (food-only — exclude wine/extras for realistic baskets).
const menuRows = await runSql(`
  select i.id, i.name, i.price_ron::float as price, c.name as cat
  from public.restaurant_menu_items i
  join public.restaurant_menu_categories c on c.id = i.category_id
  where i.tenant_id = ${sqlStr(TENANT_ID)}::uuid
    and i.is_available = true
    and c.name not in ('Selecție de Vinuri 750ml', 'Extra Toppings Pizza', 'Sosuri Speciale')
  order by i.price_ron asc;
`);
const MENU = (Array.isArray(menuRows) ? menuRows : []).map((m) => ({
  id: m.id,
  name: m.name,
  price: Number(m.price),
  cat: m.cat,
}));
if (MENU.length < 20) {
  console.error(
    `[seed-foisorul-a] only ${MENU.length} food menu items after filter — aborting.`,
  );
  exit(1);
}
console.log(`[seed-foisorul-a] menu sample: ${MENU.length} food items in pool`);

// Pick 5 "popular" items (top-revenue per dashboard) — biased toward grilled-meat.
const POPULAR_IDX = [];
for (let i = 0; i < MENU.length && POPULAR_IDX.length < 5; i++) {
  // Prefer items with "Mușchi", "Mici", "Grătar", "Burger", or 30-50 RON range.
  if (/Mușchi|Mici|Grătar|Burger|Pui|Porc|Cordon|Schnitzel/i.test(MENU[i].name)) {
    POPULAR_IDX.push(i);
  }
}
// Fallback: top-priced 5 if pattern didn't match enough.
while (POPULAR_IDX.length < 5) {
  const candidate = Math.min(MENU.length - 1, 30 + POPULAR_IDX.length);
  if (!POPULAR_IDX.includes(candidate)) POPULAR_IDX.push(candidate);
}

// Pull delivery zones.
const zoneRows = await runSql(`
  select id from public.delivery_zones
  where tenant_id = ${sqlStr(TENANT_ID)}::uuid and is_active = true
  order by sort_order asc, created_at asc;
`);
const ZONE_IDS = (Array.isArray(zoneRows) ? zoneRows : []).map((z) => z.id);

// Pull a default courier fleet — required NOT NULL FK on courier_profiles
// and courier_orders.
const fleetRows = await runSql(`
  select id from public.courier_fleets
  where lower(name) like 'hir default%'
  order by created_at asc
  limit 1;
`);
let DEFAULT_FLEET_ID = (Array.isArray(fleetRows) && fleetRows[0]) ? fleetRows[0].id : null;
if (!DEFAULT_FLEET_ID && !args.dryRun) {
  console.error('[seed-foisorul-a] no "HIR Default Fleet" courier_fleet found — aborting.');
  exit(1);
}
if (!DEFAULT_FLEET_ID) DEFAULT_FLEET_ID = '00000000-0000-0000-0000-fleet00000000';

// 5. Build the seed.
const rng = makeRng(20260505); // deterministic per date
const NOW = new Date('2026-05-05T18:00:00Z'); // anchor "now" so screenshots are stable

// 5a. Demo couriers — 4 of them. We insert into auth.users + courier_profiles.
const courierAuthUuids = [];
for (let i = 0; i < COURIER_NAMES.length; i++) {
  // Deterministic UUIDs derived from index so reseeding produces same ids.
  const u = `00000000-d3a1-4ec0-aa00-${String(i).padStart(9, '0')}c01`;
  courierAuthUuids.push(u);
}

// 5b. Customers — 250 of them, evenly distributed but with growth curve in
// last 10 days (more customers in the recent window).
const TOTAL_CUSTOMERS = 250;
const customers = [];
for (let i = 0; i < TOTAL_CUSTOMERS; i++) {
  const fn = rng.pick(FIRST_NAMES);
  const ln = rng.pick(LAST_NAMES);
  // Days ago this customer first appeared. Growth curve: 60% in last 10d.
  let firstSeenDaysAgo;
  if (rng.next() < 0.6) firstSeenDaysAgo = rng.randInt(0, 10);
  else firstSeenDaysAgo = rng.randInt(11, 29);
  const street = rng.pick(BRASOV_STREETS);
  const num = rng.randInt(1, 180);
  // Brașov center 45.6427, 25.5887 ± ~0.025 deg ≈ ~3 km
  const lat = 45.6427 + (rng.next() - 0.5) * 0.05;
  const lng = 25.5887 + (rng.next() - 0.5) * 0.06;
  customers.push({
    idx: i,
    first_name: fn,
    last_name: ln,
    email: `demo${String(i).padStart(3, '0')}${DEMO_MARKERS.CUSTOMER_EMAIL_DOMAIN}`,
    phone: `${DEMO_MARKERS.CUSTOMER_PHONE_PREFIX}${String(i).padStart(4, '0')}`,
    addr: { line1: `${street} nr. ${num}`, city: 'Brașov', postal: `5000${rng.randInt(10, 99)}`, lat, lng },
    firstSeenDaysAgo,
  });
}

// 5c. Orders — distribute ~700 across 30 days.
//   weekday: 18 ± 4 orders, weekend: 36 ± 6
//   time-of-day: 35% lunch (12-14), 40% dinner (19-22), 25% other (10-23)
function isWeekend(date) {
  const d = date.getUTCDay();
  return d === 0 || d === 6;
}

const orderPlan = [];
for (let dayAgo = 29; dayAgo >= 0; dayAgo--) {
  const dayDate = new Date(NOW.getTime() - dayAgo * 24 * 3600 * 1000);
  const baseCount = isWeekend(dayDate) ? rng.randInt(30, 42) : rng.randInt(15, 22);
  for (let k = 0; k < baseCount; k++) {
    // Time-of-day bucket
    const bucket = rng.weighted([['LUNCH', 35], ['DINNER', 40], ['OTHER', 25]]);
    let hour, minute;
    if (bucket === 'LUNCH') {
      hour = rng.randInt(12, 13); minute = rng.randInt(0, 59);
    } else if (bucket === 'DINNER') {
      hour = rng.randInt(19, 21); minute = rng.randInt(0, 59);
    } else {
      hour = rng.randInt(10, 22); minute = rng.randInt(0, 59);
    }
    const ts = new Date(dayDate);
    ts.setUTCHours(hour, minute, rng.randInt(0, 59), 0);
    if (ts > NOW) continue;
    orderPlan.push({ ts, dayAgo });
  }
}
// Trim/extend to ~700.
while (orderPlan.length > 720) orderPlan.pop();
console.log(`[seed-foisorul-a] order plan: ${orderPlan.length} orders across 30 days`);

// 5d. Pick a customer for each order — 60% return rate, weighted by recency.
function pickCustomerForOrder(daysAgo) {
  const eligible = customers.filter((c) => c.firstSeenDaysAgo >= daysAgo);
  if (eligible.length === 0) return rng.pick(customers);
  // 60% returning customer (already seen one in the prefix), 40% new
  if (rng.next() < 0.6 && eligible.length > 5) {
    // Prefer one that placed an order recently — approximated by random pick
    // weighted toward older firstSeenDaysAgo (those have had more time to repeat)
    return rng.pick(eligible);
  }
  return rng.pick(eligible);
}

// 5e. Build line items + totals
function buildOrderItems() {
  const itemCount = rng.weighted([[1, 25], [2, 45], [3, 22], [4, 8]]);
  const items = [];
  let subtotal = 0;
  for (let k = 0; k < itemCount; k++) {
    // 40% chance pick from popular list, 60% from full menu
    const idx = rng.next() < 0.4 ? rng.pick(POPULAR_IDX) : rng.randInt(0, MENU.length - 1);
    const m = MENU[idx];
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
  // Average ticket target 55-85: nudge up if too low
  if (subtotal < 35) {
    const m = MENU[rng.pick(POPULAR_IDX)];
    items.push({ item_id: m.id, name: m.name, quantity: 1, price_ron: m.price, modifiers: [] });
    subtotal += m.price;
  }
  return { items, subtotal: Math.round(subtotal * 100) / 100 };
}

function pickStatus(orderTs) {
  const ageHours = (NOW.getTime() - orderTs.getTime()) / 3600000;
  if (ageHours > 24) {
    // Historical: 96% DELIVERED, 4% CANCELLED
    return rng.weighted([['DELIVERED', 96], ['CANCELLED', 4]]);
  }
  // Last 24h: realistic active mix
  if (ageHours < 0.5) return 'PENDING';
  if (ageHours < 1.0) return rng.weighted([['CONFIRMED', 60], ['PENDING', 40]]);
  if (ageHours < 1.5) return rng.weighted([['PREPARING', 70], ['CONFIRMED', 30]]);
  if (ageHours < 2.0) return rng.weighted([['IN_DELIVERY', 60], ['PREPARING', 30], ['READY', 10]]);
  // 2-24h: mostly delivered, a few stuck
  return rng.weighted([['DELIVERED', 92], ['CANCELLED', 4], ['IN_DELIVERY', 4]]);
}

// 5f. Generate per-order data structures
const orders = [];
for (let i = 0; i < orderPlan.length; i++) {
  const plan = orderPlan[i];
  const cust = pickCustomerForOrder(plan.dayAgo);
  const { items, subtotal } = buildOrderItems();
  const status = pickStatus(plan.ts);
  // Payment method mix: 65% COD, 25% CARD-online, 10% CARD-pos (collapse pos→CARD here)
  const paymentMethod = rng.weighted([['COD', 65], ['CARD', 35]]);
  // Pickup vs delivery: 92% delivery (Brașov FOISORUL A is delivery-heavy)
  const isPickup = rng.next() < 0.08;
  const deliveryFee = isPickup ? 0 : rng.weighted([[10, 50], [12, 30], [15, 20]]);
  const total = Math.round((subtotal + deliveryFee) * 100) / 100;
  // payment_status: COD orders stay UNPAID until delivery → so PAID only for CARD+DELIVERED
  let paymentStatus;
  if (status === 'CANCELLED') paymentStatus = 'UNPAID';
  else if (paymentMethod === 'COD') paymentStatus = 'UNPAID';
  else if (status === 'DELIVERED') paymentStatus = 'PAID';
  else if (status === 'PENDING') paymentStatus = 'UNPAID';
  else paymentStatus = 'PAID'; // CARD + active = paid upfront

  // Pick a zone for delivery orders
  const zoneId = !isPickup && ZONE_IDS.length > 0 ? rng.pick(ZONE_IDS) : null;

  orders.push({
    idx: i,
    ts: plan.ts,
    custIdx: cust.idx,
    items,
    subtotal,
    deliveryFee,
    total,
    status,
    paymentStatus,
    paymentMethod,
    isPickup,
    zoneId,
    notes: `${DEMO_MARKERS.ORDER_NOTES_PREFIX} order#${String(i).padStart(4, '0')}`,
  });
}

// 5g. Reviews — 20% of DELIVERED, mostly 4-5 stars
const reviewedOrders = [];
for (const o of orders) {
  if (o.status !== 'DELIVERED') continue;
  if (rng.next() > 0.2) continue;
  const rating = rng.weighted([[5, 55], [4, 30], [3, 12], [2, 2], [1, 1]]);
  const comment = rating >= 4
    ? rng.pick(REVIEW_COMMENTS_POSITIVE)
    : rng.pick(REVIEW_COMMENTS_NEUTRAL);
  reviewedOrders.push({ orderIdx: o.idx, rating, comment, ts: new Date(o.ts.getTime() + 24 * 3600 * 1000) });
}

// 5h. Courier shifts — 80 shifts across 30 days, 4 couriers
//     Each courier: ~20 shifts (20 / 30d ≈ 4-5/week)
const shifts = [];
for (let cIdx = 0; cIdx < COURIER_NAMES.length; cIdx++) {
  // Pick ~20 days out of 30 for this courier; weighted by rng
  const shiftDays = new Set();
  while (shiftDays.size < 20) shiftDays.add(rng.randInt(0, 29));
  for (const dayAgo of shiftDays) {
    // Shift typically 11:00-15:00 (lunch) or 18:00-23:00 (dinner)
    const isDinner = rng.next() < 0.55;
    const start = new Date(NOW.getTime() - dayAgo * 24 * 3600 * 1000);
    if (isDinner) start.setUTCHours(18, rng.randInt(0, 30), 0, 0);
    else start.setUTCHours(11, rng.randInt(0, 30), 0, 0);
    const durationH = isDinner ? 4 + rng.next() * 1.5 : 4 + rng.next();
    const end = new Date(start.getTime() + durationH * 3600 * 1000);
    if (start > NOW) continue;
    shifts.push({
      courierIdx: cIdx,
      started_at: start,
      ended_at: end > NOW ? null : end,
      // last shift can stay ONLINE for "live" feel
      status: dayAgo === 0 && end > NOW ? 'ONLINE' : 'OFFLINE',
      last_lat: PICKUP.lat + (rng.next() - 0.5) * 0.02,
      last_lng: PICKUP.lng + (rng.next() - 0.5) * 0.02,
    });
  }
}

// 5i. Courier orders — one per delivered/in-delivery non-pickup order
const courierOrders = [];
for (const o of orders) {
  if (o.isPickup) continue;
  if (o.status === 'CANCELLED' || o.status === 'PENDING' || o.status === 'CONFIRMED') continue;
  // Map restaurant order status -> courier order status
  let coStatus;
  if (o.status === 'DELIVERED') coStatus = 'DELIVERED';
  else if (o.status === 'IN_DELIVERY') coStatus = 'IN_TRANSIT';
  else if (o.status === 'READY' || o.status === 'PREPARING') coStatus = 'OFFERED';
  else coStatus = 'CREATED';
  // Assign courier — prefer one whose shift covered this time
  const eligibleShifts = shifts.filter((s) =>
    s.started_at <= o.ts && (s.ended_at == null || s.ended_at >= o.ts),
  );
  const assignedCourier = eligibleShifts.length > 0
    ? eligibleShifts[rng.randInt(0, eligibleShifts.length - 1)].courierIdx
    : rng.randInt(0, COURIER_NAMES.length - 1);
  courierOrders.push({
    orderIdx: o.idx,
    custIdx: o.custIdx,
    courierIdx: assignedCourier,
    status: coStatus,
    ts: o.ts,
    paymentMethod: o.paymentMethod === 'COD' ? 'COD' : 'CARD',
    total: o.total,
    deliveryFee: o.deliveryFee,
  });
}

console.log(
  `[seed-foisorul-a] generated: customers=${customers.length} orders=${orders.length} ` +
    `reviews=${reviewedOrders.length} shifts=${shifts.length} courier_orders=${courierOrders.length}`,
);

// 6. Assemble + run SQL in chunks (one transaction per chunk to keep payloads
//    under typical Mgmt API limits).

// 6a. Couriers (auth.users + courier_profiles).
const courierSql = [];
courierSql.push('begin;');
for (let i = 0; i < COURIER_NAMES.length; i++) {
  const c = COURIER_NAMES[i];
  const uid = courierAuthUuids[i];
  const email = `courier${String(i + 1).padStart(2, '0')}${DEMO_MARKERS.COURIER_AUTH_EMAIL_DOMAIN}`;
  const phone = `${DEMO_MARKERS.COURIER_PHONE_PREFIX}${String(i + 1).padStart(2, '0')}`;
  // Insert auth.users — minimal columns. instance_id default null is fine for
  // service-role inserts; aud + role are conventional. We don't store a real
  // password hash because demo couriers never log in via the app.
  courierSql.push(`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, is_sso_user, is_anonymous)
    values (
      ${sqlStr(uid)}::uuid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated',
      'authenticated',
      ${sqlStr(email)},
      crypt('demo-no-login-${i}', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      ${sqlJson({ demo_seed: true, full_name: `${c.first} ${c.last}` })},
      false,
      now(),
      now(),
      false,
      false
    )
    on conflict (id) do nothing;
  `);
  courierSql.push(`
    insert into public.courier_profiles (user_id, full_name, phone, vehicle_type, status, fleet_id, created_at)
    values (
      ${sqlStr(uid)}::uuid,
      ${sqlStr(`${c.first} ${c.last}`)},
      ${sqlStr(phone)},
      ${sqlStr(c.vehicle)},
      'ACTIVE',
      ${sqlStr(DEFAULT_FLEET_ID)}::uuid,
      now() - interval '${30 + i * 10} days'
    )
    on conflict (user_id) do nothing;
  `);
}
courierSql.push('commit;');
await runSql(courierSql.join('\n'));
console.log(`[seed-foisorul-a] couriers seeded (${COURIER_NAMES.length})`);

// 6b. Customers + addresses (one transaction, batched VALUES).
//     We'll use a CTE to insert customers, returning their ids, then insert
//     addresses keyed by the email (idempotent natural key).
const customerSql = [];
customerSql.push('begin;');
// Build a single VALUES clause for customers. Idempotency: skip rows whose
// (tenant, email) already exists. The customers table has no unique on
// (tenant_id, email) so we filter via NOT EXISTS rather than ON CONFLICT.
const custValues = customers.map((c) =>
  `(${sqlStr(TENANT_ID)}::uuid, ${sqlStr(c.email)}, ${sqlStr(c.phone)}, ` +
    `${sqlStr(c.first_name)}, ${sqlStr(c.last_name)}, ` +
    `now() - interval '${c.firstSeenDaysAgo} days')`
).join(',\n  ');
customerSql.push(`
  insert into public.customers (tenant_id, email, phone, first_name, last_name, created_at)
  select v.* from (values
    ${custValues}
  ) as v(tenant_id, email, phone, first_name, last_name, created_at)
  where not exists (
    select 1 from public.customers c
    where c.tenant_id = v.tenant_id and c.email = v.email
  );
`);
// Now grab their ids back into a temp mapping table that we'll reuse for orders.
customerSql.push(`
  drop table if exists pg_temp.demo_seed_customer_map;
  create temp table pg_temp.demo_seed_customer_map as
    select id, email from public.customers
    where tenant_id = ${sqlStr(TENANT_ID)}::uuid
      and email like '%${DEMO_MARKERS.CUSTOMER_EMAIL_DOMAIN}';
  create index on pg_temp.demo_seed_customer_map (email);
`);
// Addresses (one per customer)
const addrValues = customers.map((c) =>
  `((select id from pg_temp.demo_seed_customer_map where email = ${sqlStr(c.email)}), ` +
    `${sqlStr(c.addr.line1)}, ${sqlStr(c.addr.city)}, ${sqlStr(c.addr.postal)}, 'RO', ` +
    `${c.addr.lat.toFixed(6)}, ${c.addr.lng.toFixed(6)}, 'Acasă', ` +
    `now() - interval '${c.firstSeenDaysAgo} days')`
).join(',\n  ');
// Idempotency: skip address insert if customer already has any address.
customerSql.push(`
  insert into public.customer_addresses (customer_id, line1, city, postal_code, country, latitude, longitude, label, created_at)
  select v.* from (values
    ${addrValues}
  ) as v(customer_id, line1, city, postal_code, country, latitude, longitude, label, created_at)
  where v.customer_id is not null
    and not exists (
      select 1 from public.customer_addresses ca where ca.customer_id = v.customer_id
    );
`);
customerSql.push('commit;');
// Run in a single shot — SQL string ~80KB, well within Mgmt API limits.
await runSql(customerSql.join('\n'));
console.log(`[seed-foisorul-a] customers + addresses seeded (${customers.length})`);

// 6c. Orders — batched in groups of 100 so we don't blow the SQL payload limit.
//     Each group is its own transaction; if one fails the rest still run, but
//     idempotency kicks in on retry (we use notes-prefix + tenant_id + ts as
//     a uniqueness signal).

const ORDER_BATCH = 100;
let ordersInserted = 0;
for (let start = 0; start < orders.length; start += ORDER_BATCH) {
  const batch = orders.slice(start, start + ORDER_BATCH);
  const sql = [];
  sql.push('begin;');
  // Refresh the customer map for this connection (temp tables are session-scoped).
  sql.push(`
    drop table if exists pg_temp.demo_seed_customer_map;
    create temp table pg_temp.demo_seed_customer_map as
      select id, email from public.customers
      where tenant_id = ${sqlStr(TENANT_ID)}::uuid
        and email like '%${DEMO_MARKERS.CUSTOMER_EMAIL_DOMAIN}';
    create index on pg_temp.demo_seed_customer_map (email);

    drop table if exists pg_temp.demo_seed_address_map;
    create temp table pg_temp.demo_seed_address_map as
      select ca.customer_id, ca.id as address_id
      from public.customer_addresses ca
      join pg_temp.demo_seed_customer_map cm on cm.id = ca.customer_id;
    create index on pg_temp.demo_seed_address_map (customer_id);
  `);

  // One INSERT per order — each has subqueries for customer_id/address_id.
  // Direct VALUES on a typed table (tenant_id NOT NULL etc.) is safer than a
  // derived "select from (values...)" because Postgres infers untyped jsonb /
  // null columns incorrectly otherwise.
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
        ${sqlStr(TENANT_ID)}::uuid,
        ${customerSel},
        ${addressSel},
        ${sqlJson(o.items)},
        ${o.subtotal.toFixed(2)}, ${o.deliveryFee.toFixed(2)}, ${o.total.toFixed(2)},
        ${sqlStr(o.status)}, ${sqlStr(o.paymentStatus)}, ${sqlStr(o.paymentMethod)},
        ${o.zoneId ? sqlStr(o.zoneId) + '::uuid' : 'null::uuid'},
        ${sqlStr(o.notes)},
        ${sqlTs(o.ts)}, ${sqlTs(o.ts)}, ${sqlTs(o.ts)}
      where ${customerSel} is not null;
    `);
  }
  sql.push('commit;');

  await runSql(sql.join('\n'));
  ordersInserted += batch.length;
  console.log(`[seed-foisorul-a]   orders ${ordersInserted}/${orders.length}`);
}

// 6d. Reviews — match by notes prefix. We need order_id; look up by notes match.
const reviewSql = [];
reviewSql.push('begin;');
for (const r of reviewedOrders) {
  const targetNotes = `${DEMO_MARKERS.ORDER_NOTES_PREFIX} order#${String(r.orderIdx).padStart(4, '0')}`;
  reviewSql.push(`
    insert into public.restaurant_reviews (tenant_id, order_id, rating, comment, created_at)
    select ${sqlStr(TENANT_ID)}::uuid, o.id, ${r.rating}, ${sqlStr(r.comment)}, ${sqlTs(r.ts)}
    from public.restaurant_orders o
    where o.tenant_id = ${sqlStr(TENANT_ID)}::uuid
      and o.notes = ${sqlStr(targetNotes)}
    on conflict (order_id) do nothing;
  `);
}
reviewSql.push('commit;');
// Reviews: do in 200-row batches
const REV_BATCH = 200;
const revStmts = reviewSql.slice(1, -1); // drop begin/commit
for (let s = 0; s < revStmts.length; s += REV_BATCH) {
  const slice = ['begin;', ...revStmts.slice(s, s + REV_BATCH), 'commit;'];
  await runSql(slice.join('\n'));
}
console.log(`[seed-foisorul-a] reviews seeded (${reviewedOrders.length})`);

// 6e. Courier shifts.
const shiftSql = [];
shiftSql.push('begin;');
const shiftValues = shifts.map((s) =>
  `(${sqlStr(courierAuthUuids[s.courierIdx])}::uuid, ` +
    `${sqlTs(s.started_at)}, ` +
    `${s.ended_at ? sqlTs(s.ended_at) : 'null'}, ` +
    `${sqlStr(s.status)}, ` +
    `${s.last_lat.toFixed(7)}, ${s.last_lng.toFixed(7)}, ` +
    `${s.ended_at ? sqlTs(s.ended_at) : 'now()'})`
).join(',\n  ');
// uq_courier_shifts_one_online conflicts if any courier already has an ONLINE
// shift; we set non-current shifts to OFFLINE and rely on the unique partial
// index. Use an ON CONFLICT DO NOTHING via the partial unique — easier to skip
// pre-existing online shifts by checking first.
shiftSql.push(`
  -- Drop demo couriers' existing shifts before reseeding (idempotent).
  delete from public.courier_shifts
  where courier_user_id in (${courierAuthUuids.map((u) => sqlStr(u) + '::uuid').join(', ')});
`);
shiftSql.push(`
  insert into public.courier_shifts (courier_user_id, started_at, ended_at, status, last_lat, last_lng, last_seen_at)
  values
  ${shiftValues};
`);
shiftSql.push('commit;');
await runSql(shiftSql.join('\n'));
console.log(`[seed-foisorul-a] shifts seeded (${shifts.length})`);

// 6f. Courier orders — one per non-pickup non-cancelled non-pending order.
const COURIER_ORDER_BATCH = 100;
let coInserted = 0;
for (let start = 0; start < courierOrders.length; start += COURIER_ORDER_BATCH) {
  const batch = courierOrders.slice(start, start + COURIER_ORDER_BATCH);
  const sql = [];
  sql.push('begin;');
  // Customer + address lookup map (session-scoped).
  sql.push(`
    drop table if exists pg_temp.demo_seed_customer_map;
    create temp table pg_temp.demo_seed_customer_map as
      select id, email, first_name, phone from public.customers
      where tenant_id = ${sqlStr(TENANT_ID)}::uuid
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
    const sourceOrderId = `${DEMO_MARKERS.COURIER_ORDER_PREFIX}${String(co.orderIdx).padStart(4, '0')}`;
    const trackToken = `demo-track-${String(co.orderIdx).padStart(4, '0')}`;
    rows.push(
      `('HIR_TENANT', ${sqlStr(TENANT_ID)}::uuid, ${sqlStr(sourceOrderId)}, ` +
        `(select first_name from pg_temp.demo_seed_customer_map where email = ${sqlStr(cust.email)}), ` +
        `(select phone from pg_temp.demo_seed_customer_map where email = ${sqlStr(cust.email)}), ` +
        `${sqlStr(PICKUP.line1)}, ${PICKUP.lat}, ${PICKUP.lng}, ` +
        `(select line1 from pg_temp.demo_seed_address_map where customer_id = (select id from pg_temp.demo_seed_customer_map where email = ${sqlStr(cust.email)}) limit 1), ` +
        `(select latitude from pg_temp.demo_seed_address_map where customer_id = (select id from pg_temp.demo_seed_customer_map where email = ${sqlStr(cust.email)}) limit 1), ` +
        `(select longitude from pg_temp.demo_seed_address_map where customer_id = (select id from pg_temp.demo_seed_customer_map where email = ${sqlStr(cust.email)}) limit 1), ` +
        `'[]'::jsonb, ${co.total.toFixed(2)}, ${co.deliveryFee.toFixed(2)}, ${sqlStr(co.paymentMethod)}, ` +
        `${sqlStr(co.status)}, ${sqlStr(courierAuthUuids[co.courierIdx])}::uuid, ${sqlStr(trackToken)}, ` +
        `${sqlStr(DEFAULT_FLEET_ID)}::uuid, 'restaurant', ` +
        `${sqlTs(co.ts)}, ${sqlTs(co.ts)})`,
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
    )
    values
    ${rows.join(',\n    ')}
    on conflict (public_track_token) do nothing;
  `);
  sql.push('commit;');
  await runSql(sql.join('\n'));
  coInserted += batch.length;
  console.log(`[seed-foisorul-a]   courier_orders ${coInserted}/${courierOrders.length}`);
}

// 6g. Affiliate applications.
const affSql = [];
affSql.push('begin;');
for (let i = 0; i < AFFILIATE_APPS.length; i++) {
  const a = AFFILIATE_APPS[i];
  const email = `affiliate${String(i + 1).padStart(2, '0')}${DEMO_MARKERS.AFFILIATE_EMAIL_DOMAIN}`;
  const phone = `${DEMO_MARKERS.CUSTOMER_PHONE_PREFIX}9${String(i).padStart(3, '0')}`;
  // channels is text[]
  const channelsLit = `array[${a.channels.map(sqlStr).join(',')}]::text[]`;
  affSql.push(`
    insert into public.affiliate_applications (
      full_name, email, phone, audience_type, audience_size, channels, pitch, status, created_at
    ) values (
      ${sqlStr(a.full_name)}, ${sqlStr(email)}, ${sqlStr(phone)},
      ${sqlStr(a.audience_type)}, ${a.audience_size === null ? 'null' : a.audience_size},
      ${channelsLit}, ${sqlStr(a.pitch)}, 'PENDING',
      now() - interval '${i + 1} days'
    )
    on conflict do nothing;
  `);
}
affSql.push('commit;');
await runSql(affSql.join('\n'));
console.log(`[seed-foisorul-a] affiliate applications seeded (${AFFILIATE_APPS.length})`);

// 7. Final summary.
const finalSummary = await runSql(`
  select
    (select count(*)::int from public.customers
       where tenant_id = ${sqlStr(TENANT_ID)}::uuid
         and email like '%${DEMO_MARKERS.CUSTOMER_EMAIL_DOMAIN}') as customers,
    (select count(*)::int from public.restaurant_orders
       where tenant_id = ${sqlStr(TENANT_ID)}::uuid
         and notes like '${DEMO_MARKERS.ORDER_NOTES_PREFIX}%') as orders,
    (select count(*)::int from public.restaurant_orders
       where tenant_id = ${sqlStr(TENANT_ID)}::uuid
         and notes like '${DEMO_MARKERS.ORDER_NOTES_PREFIX}%'
         and status = 'DELIVERED') as delivered,
    (select coalesce(sum(total_ron), 0)::numeric(12,2) from public.restaurant_orders
       where tenant_id = ${sqlStr(TENANT_ID)}::uuid
         and notes like '${DEMO_MARKERS.ORDER_NOTES_PREFIX}%'
         and status <> 'CANCELLED') as revenue,
    (select count(*)::int from public.restaurant_reviews r
       join public.restaurant_orders o on o.id = r.order_id
       where r.tenant_id = ${sqlStr(TENANT_ID)}::uuid
         and o.notes like '${DEMO_MARKERS.ORDER_NOTES_PREFIX}%') as reviews,
    (select count(*)::int from public.courier_shifts s
       where s.courier_user_id in (${courierAuthUuids.map((u) => sqlStr(u) + '::uuid').join(', ')})) as shifts,
    (select count(*)::int from public.courier_orders
       where source_tenant_id = ${sqlStr(TENANT_ID)}::uuid
         and source_order_id like '${DEMO_MARKERS.COURIER_ORDER_PREFIX}%') as courier_orders,
    (select count(*)::int from public.affiliate_applications
       where email like '%${DEMO_MARKERS.AFFILIATE_EMAIL_DOMAIN}') as affiliates;
`);
const s = Array.isArray(finalSummary) ? finalSummary[0] : {};
console.log('');
console.log('[seed-foisorul-a] === SEEDING COMPLETE ===');
console.log(`  customers:         ${s.customers}`);
console.log(`  orders:            ${s.orders}  (${s.delivered} delivered)`);
console.log(`  revenue (RON):     ${s.revenue}`);
console.log(`  reviews:           ${s.reviews}`);
console.log(`  courier shifts:    ${s.shifts}`);
console.log(`  courier orders:    ${s.courier_orders}`);
console.log(`  affiliate apps:    ${s.affiliates}`);
console.log('');
console.log('To remove: node scripts/demo-seed/cleanup-foisorul-a.mjs');
exit(0);

// ---- inline cleanup builder for --reset ----------------------------------
function buildCleanupSql(tenantId) {
  // FK-safe order: reviews → orders → addresses → customers; courier_orders →
  // shifts → courier_profiles → auth.users; affiliate_applications.
  const courierUuidList = [];
  for (let i = 0; i < COURIER_NAMES.length; i++) {
    courierUuidList.push(`'00000000-d3a1-4ec0-aa00-${String(i).padStart(11, '0')}c01'::uuid`);
  }
  return `
    begin;
    -- restaurant_reviews cascade-delete via order; explicit just to be safe.
    delete from public.restaurant_reviews
    where tenant_id = ${sqlStr(tenantId)}::uuid
      and order_id in (
        select id from public.restaurant_orders
        where tenant_id = ${sqlStr(tenantId)}::uuid
          and notes like '${DEMO_MARKERS.ORDER_NOTES_PREFIX}%'
      );
    delete from public.restaurant_orders
    where tenant_id = ${sqlStr(tenantId)}::uuid
      and notes like '${DEMO_MARKERS.ORDER_NOTES_PREFIX}%';
    delete from public.customer_addresses
    where customer_id in (
      select id from public.customers
      where tenant_id = ${sqlStr(tenantId)}::uuid
        and email like '%${DEMO_MARKERS.CUSTOMER_EMAIL_DOMAIN}'
    );
    delete from public.customers
    where tenant_id = ${sqlStr(tenantId)}::uuid
      and email like '%${DEMO_MARKERS.CUSTOMER_EMAIL_DOMAIN}';
    delete from public.courier_orders
    where source_tenant_id = ${sqlStr(tenantId)}::uuid
      and source_order_id like '${DEMO_MARKERS.COURIER_ORDER_PREFIX}%';
    delete from public.courier_shifts
    where courier_user_id in (${courierUuidList.join(', ')});
    delete from public.courier_profiles
    where user_id in (${courierUuidList.join(', ')});
    delete from auth.users
    where id in (${courierUuidList.join(', ')});
    delete from public.affiliate_applications
    where email like '%${DEMO_MARKERS.AFFILIATE_EMAIL_DOMAIN}';
    commit;
  `;
}
