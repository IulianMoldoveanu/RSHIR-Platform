// HIR Restaurant Suite — FOISORUL A demo-data cleanup.
//
// Removes ONLY the rows tagged by seed-foisorul-a.mjs (see DEMO_MARKERS in
// common.mjs). Real customer data is left alone.
//
// Cleanup matchers:
//   - public.restaurant_orders.notes  LIKE '[DEMO_SEED]%'
//   - public.restaurant_reviews.order_id IN (... matched orders)
//   - public.customer_addresses.customer_id IN (... matched customers)
//   - public.customers.email LIKE '%@hir-demo.ro'
//   - public.courier_orders.source_order_id LIKE 'DEMO-SEED-%'
//   - public.courier_shifts.courier_user_id IN (deterministic demo UUIDs)
//   - public.courier_profiles.user_id IN (deterministic demo UUIDs)
//   - auth.users.id IN (deterministic demo UUIDs)
//   - public.affiliate_applications.email LIKE '%@hir-demo.ro'
//
// Usage:
//   node scripts/demo-seed/cleanup-foisorul-a.mjs --dry-run
//   node scripts/demo-seed/cleanup-foisorul-a.mjs

import { argv, exit } from 'node:process';
import { loadSecrets, makeSqlRunner, sqlStr, DEMO_MARKERS } from './common.mjs';

const TARGET_SLUG = 'foisorul-a';

function parseArgs() {
  const args = { dryRun: false, yes: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--yes' || a === '-y') args.yes = true;
    else if (a === '--help' || a === '-h') {
      console.log('usage: node scripts/demo-seed/cleanup-foisorul-a.mjs [--dry-run] [--yes]');
      exit(0);
    } else {
      console.error(`unknown arg: ${a}`);
      exit(2);
    }
  }
  return args;
}

const args = parseArgs();
const secrets = loadSecrets();
const runSql = await makeSqlRunner(secrets, { dryRun: args.dryRun });

console.log(
  `[cleanup-foisorul-a] target project ref: ${secrets.SUPABASE_PROJECT_REF}` +
    (args.dryRun ? ' (DRY-RUN)' : ''),
);

// 1. Resolve tenant.
const tenantRows = await runSql(
  `select id, slug, name from public.tenants where slug = ${sqlStr(TARGET_SLUG)} limit 1;`,
);
const tenant = Array.isArray(tenantRows) ? tenantRows[0] : null;
if (!tenant) {
  console.error(`[cleanup-foisorul-a] tenant slug=${TARGET_SLUG} not found.`);
  exit(1);
}
console.log(
  `[cleanup-foisorul-a] tenant: ${tenant.name} (${tenant.slug}) ${tenant.id}`,
);
const TENANT_ID = tenant.id;

// 2. Pre-flight count of demo rows.
const beforeRows = await runSql(`
  select
    (select count(*)::int from public.customers
       where tenant_id = ${sqlStr(TENANT_ID)}::uuid
         and email like '%${DEMO_MARKERS.CUSTOMER_EMAIL_DOMAIN}') as customers,
    (select count(*)::int from public.restaurant_orders
       where tenant_id = ${sqlStr(TENANT_ID)}::uuid
         and notes like '${DEMO_MARKERS.ORDER_NOTES_PREFIX}%') as orders,
    (select count(*)::int from public.courier_orders
       where source_tenant_id = ${sqlStr(TENANT_ID)}::uuid
         and source_order_id like '${DEMO_MARKERS.COURIER_ORDER_PREFIX}%') as courier_orders,
    (select count(*)::int from public.courier_profiles
       where phone like '${DEMO_MARKERS.COURIER_PHONE_PREFIX}%') as couriers,
    (select count(*)::int from public.affiliate_applications
       where email like '%${DEMO_MARKERS.AFFILIATE_EMAIL_DOMAIN}') as affiliates;
`);
const before = Array.isArray(beforeRows) ? beforeRows[0] : {};
console.log(
  `[cleanup-foisorul-a] BEFORE: customers=${before.customers ?? 0} orders=${before.orders ?? 0} ` +
    `courier_orders=${before.courier_orders ?? 0} couriers=${before.couriers ?? 0} ` +
    `affiliates=${before.affiliates ?? 0}`,
);

if (
  (before.customers ?? 0) === 0 &&
  (before.orders ?? 0) === 0 &&
  (before.courier_orders ?? 0) === 0 &&
  (before.couriers ?? 0) === 0 &&
  (before.affiliates ?? 0) === 0
) {
  console.log('[cleanup-foisorul-a] no demo rows found, nothing to do.');
  exit(0);
}

// 3. Look up demo courier auth UUIDs by phone prefix (more robust than baking
//    UUIDs into both scripts; phone prefix is the source of truth).
const courierRows = await runSql(`
  select user_id from public.courier_profiles
  where phone like '${DEMO_MARKERS.COURIER_PHONE_PREFIX}%';
`);
const courierUuids = (Array.isArray(courierRows) ? courierRows : []).map(
  (r) => `${sqlStr(r.user_id)}::uuid`,
);
const courierUuidList = courierUuids.length > 0 ? courierUuids.join(', ') : 'null::uuid';

// 4. Cleanup transaction (FK-safe order).
const cleanupSql = `
  begin;
  -- Reviews FK to orders: cascade-on-delete handles this, but explicit delete
  -- is cleaner + avoids relying on cascades.
  delete from public.restaurant_reviews
  where tenant_id = ${sqlStr(TENANT_ID)}::uuid
    and order_id in (
      select id from public.restaurant_orders
      where tenant_id = ${sqlStr(TENANT_ID)}::uuid
        and notes like '${DEMO_MARKERS.ORDER_NOTES_PREFIX}%'
    );

  delete from public.restaurant_orders
  where tenant_id = ${sqlStr(TENANT_ID)}::uuid
    and notes like '${DEMO_MARKERS.ORDER_NOTES_PREFIX}%';

  delete from public.customer_addresses
  where customer_id in (
    select id from public.customers
    where tenant_id = ${sqlStr(TENANT_ID)}::uuid
      and email like '%${DEMO_MARKERS.CUSTOMER_EMAIL_DOMAIN}'
  );

  delete from public.customers
  where tenant_id = ${sqlStr(TENANT_ID)}::uuid
    and email like '%${DEMO_MARKERS.CUSTOMER_EMAIL_DOMAIN}';

  delete from public.courier_orders
  where source_tenant_id = ${sqlStr(TENANT_ID)}::uuid
    and source_order_id like '${DEMO_MARKERS.COURIER_ORDER_PREFIX}%';

  delete from public.courier_shifts
  where courier_user_id in (${courierUuidList});

  delete from public.courier_profiles
  where user_id in (${courierUuidList});

  delete from auth.users
  where id in (${courierUuidList})
    and email like '%${DEMO_MARKERS.COURIER_AUTH_EMAIL_DOMAIN}';

  delete from public.affiliate_applications
  where email like '%${DEMO_MARKERS.AFFILIATE_EMAIL_DOMAIN}';

  commit;
`;

await runSql(cleanupSql);

// 5. Verify post-cleanup.
if (!args.dryRun) {
  const afterRows = await runSql(`
    select
      (select count(*)::int from public.customers
         where tenant_id = ${sqlStr(TENANT_ID)}::uuid
           and email like '%${DEMO_MARKERS.CUSTOMER_EMAIL_DOMAIN}') as customers,
      (select count(*)::int from public.restaurant_orders
         where tenant_id = ${sqlStr(TENANT_ID)}::uuid
           and notes like '${DEMO_MARKERS.ORDER_NOTES_PREFIX}%') as orders,
      (select count(*)::int from public.courier_orders
         where source_tenant_id = ${sqlStr(TENANT_ID)}::uuid
           and source_order_id like '${DEMO_MARKERS.COURIER_ORDER_PREFIX}%') as courier_orders,
      (select count(*)::int from public.courier_profiles
         where phone like '${DEMO_MARKERS.COURIER_PHONE_PREFIX}%') as couriers,
      (select count(*)::int from public.affiliate_applications
         where email like '%${DEMO_MARKERS.AFFILIATE_EMAIL_DOMAIN}') as affiliates;
  `);
  const after = Array.isArray(afterRows) ? afterRows[0] : {};
  console.log(
    `[cleanup-foisorul-a] AFTER:  customers=${after.customers} orders=${after.orders} ` +
      `courier_orders=${after.courier_orders} couriers=${after.couriers} ` +
      `affiliates=${after.affiliates}`,
  );
  console.log('[cleanup-foisorul-a] done.');
}
exit(0);
