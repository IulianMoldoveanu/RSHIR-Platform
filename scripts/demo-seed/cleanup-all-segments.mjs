// Master cleanup — removes all 4 segment demo tenants + all their data.
//
// Safety:
//   - Only operates on tenants with slug LIKE 'demo-%' AND
//     settings.demo_seed = true.
//   - Refuses HIR_ENV=production unless --allow-prod.
//   - Refuses to ever touch tenants/foisorul-a (real tenant).
//
// Usage:
//   node scripts/demo-seed/cleanup-all-segments.mjs --dry-run
//   node scripts/demo-seed/cleanup-all-segments.mjs

import { argv, env, exit } from 'node:process';
import { loadSecrets, makeSqlRunner, sqlStr, DEMO_MARKERS } from './common.mjs';
import { buildTenantCleanupSql } from './common-segments.mjs';

const SEGMENT_SLUGS = [
  'demo-pizzerie-mica',
  'demo-fast-food-activ',
  'demo-restaurant-familial',
  'demo-cofetarie',
];

function parseArgs() {
  const args = { dryRun: false, allowProd: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--allow-prod') args.allowProd = true;
    else if (a === '--help' || a === '-h') {
      console.log('usage: node scripts/demo-seed/cleanup-all-segments.mjs [--dry-run] [--allow-prod]');
      exit(0);
    } else {
      console.error(`unknown arg: ${a}`);
      exit(2);
    }
  }
  return args;
}

const args = parseArgs();

if (env.HIR_ENV === 'production' && !args.allowProd) {
  console.error('[cleanup-all] HIR_ENV=production. Refusing without --allow-prod.');
  exit(2);
}

const secrets = loadSecrets();
const runSql = await makeSqlRunner(secrets, { dryRun: args.dryRun });

console.log(
  `[cleanup-all] target project ref: ${secrets.SUPABASE_PROJECT_REF}` +
    (args.dryRun ? ' (DRY-RUN)' : ''),
);

// Pre-flight: list demo tenants present.
const present = await runSql(`
  select slug, name, id
  from public.tenants
  where slug = any(array[${SEGMENT_SLUGS.map(sqlStr).join(',')}])
    and slug like 'demo-%'
    and (settings ->> 'demo_seed')::boolean = true
  order by slug;
`);
const tenantList = Array.isArray(present) ? present : [];

if (tenantList.length === 0) {
  console.log('[cleanup-all] no demo tenants present — nothing to do.');
  exit(0);
}

console.log(`[cleanup-all] will remove ${tenantList.length} demo tenant(s):`);
for (const t of tenantList) {
  console.log(`  - ${t.slug} (${t.name}) ${t.id}`);
}

// Per-tenant counts before cleanup.
for (const t of tenantList) {
  const before = await runSql(`
    select
      (select count(*)::int from public.customers
         where tenant_id = ${sqlStr(t.id)}::uuid
           and email like '%${DEMO_MARKERS.CUSTOMER_EMAIL_DOMAIN}') as customers,
      (select count(*)::int from public.restaurant_orders
         where tenant_id = ${sqlStr(t.id)}::uuid
           and notes like '${DEMO_MARKERS.ORDER_NOTES_PREFIX}%') as orders;
  `);
  const b = Array.isArray(before) ? before[0] : {};
  console.log(`  [${t.slug}] BEFORE: customers=${b.customers ?? 0} orders=${b.orders ?? 0}`);
}

// Run each tenant's FK-safe cleanup.
for (const slug of SEGMENT_SLUGS) {
  console.log(`[cleanup-all] cleaning ${slug}...`);
  await runSql(buildTenantCleanupSql(slug));
}

// Post-flight verify.
if (!args.dryRun) {
  const after = await runSql(`
    select count(*)::int as remaining
    from public.tenants
    where slug = any(array[${SEGMENT_SLUGS.map(sqlStr).join(',')}]);
  `);
  const a = Array.isArray(after) ? after[0] : {};
  console.log(`[cleanup-all] AFTER: ${a.remaining ?? 0} demo tenants remain.`);
}

console.log('[cleanup-all] done.');
exit(0);
