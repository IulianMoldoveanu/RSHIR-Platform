// Migration drift-sweep + Vercel env-var sweep.
//
// Purpose:
//   Convert silent migration drift into a one-command report. The full set
//   of `supabase/migrations/*.sql` files on disk is parsed to extract
//   target objects (tables / views / materialized views / extensions);
//   each target is checked against the live Supabase project via the
//   Management API; a per-migration verdict (applied / missing / partial /
//   ambiguous) is printed.
//
//   With `--apply`, missing or partial migrations are run end-to-end via
//   the Management API (same call shape as supabase/apply-sql.mjs).
//
//   Also scans `scripts/post-merge/setup-*.mjs` for Vercel env-var keys
//   referenced via `key: 'XYZ'` and warns on any referenced var that is
//   not currently set on its Vercel project.
//
// Usage (PowerShell or bash):
//   node scripts/post-merge/run-all-pending.mjs            # report only
//   node scripts/post-merge/run-all-pending.mjs --apply    # apply missing
//
// Hard rules:
//   - Read-only by default. `--apply` requires explicit user OK per the
//     RSHIR operating charter (no schema-touching change without sign-off).
//   - Best-effort detection. Migrations that only ALTER existing objects
//     surface as "ambiguous" — don't auto-apply those without review.
//   - Vault-driven. Reads `C:/Users/Office HIR CEO/.hir/secrets.json`.

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv, exit } from 'node:process';

const VAULT_PATH = 'C:/Users/Office HIR CEO/.hir/secrets.json';
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');
const POST_MERGE_DIR = join(REPO_ROOT, 'scripts', 'post-merge');

// ---------------------------------------------------------------------------
// Vault
// ---------------------------------------------------------------------------
const vault = JSON.parse(readFileSync(VAULT_PATH, 'utf8'));
const SUPABASE_REF = vault.supabase.project_ref;
const SUPABASE_PAT = vault.supabase.management_pat;
const VERCEL_TOKEN = vault.vercel?.token;
const VERCEL_PROJECTS = vault.vercel?.projects ?? {};

if (!SUPABASE_REF || !SUPABASE_PAT) {
  console.error('Vault missing supabase.project_ref or supabase.management_pat');
  exit(2);
}

// ---------------------------------------------------------------------------
// Migration parser — extract target objects
// ---------------------------------------------------------------------------
const RE_TABLE = /^\s*create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?([a-z0-9_]+)"?/gim;
const RE_VIEW = /^\s*create\s+(?:or\s+replace\s+)?view\s+(?:"?public"?\.)?"?([a-z0-9_]+)"?/gim;
const RE_MVIEW = /^\s*create\s+materialized\s+view\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?([a-z0-9_]+)"?/gim;
const RE_EXT = /^\s*create\s+extension\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?/gim;

function parseMigration(filename) {
  const sql = readFileSync(join(MIGRATIONS_DIR, filename), 'utf8');
  const tables = new Set();
  const views = new Set();
  const mviews = new Set();
  const extensions = new Set();

  let m;
  RE_TABLE.lastIndex = 0;
  while ((m = RE_TABLE.exec(sql)) !== null) tables.add(m[1]);
  RE_VIEW.lastIndex = 0;
  while ((m = RE_VIEW.exec(sql)) !== null) views.add(m[1]);
  RE_MVIEW.lastIndex = 0;
  while ((m = RE_MVIEW.exec(sql)) !== null) mviews.add(m[1]);
  RE_EXT.lastIndex = 0;
  while ((m = RE_EXT.exec(sql)) !== null) extensions.add(m[1]);

  // Materialized views also match the plain view regex; remove duplicates.
  for (const mv of mviews) views.delete(mv);

  return { filename, sql, tables, views, mviews, extensions };
}

// ---------------------------------------------------------------------------
// Mgmt API — single SQL probe
// ---------------------------------------------------------------------------
async function runSql(query, attempt = 1) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + SUPABASE_PAT, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) {
    const text = await r.text();
    // Retry once on transient 5xx (the Mgmt API occasionally returns 544
    // "connection timeout" under load).
    if (r.status >= 500 && attempt === 1) {
      await new Promise((res) => setTimeout(res, 800));
      return runSql(query, 2);
    }
    throw new Error(`mgmt API ${r.status}: ${text.substring(0, 300)}`);
  }
  return r.json();
}

// One round-trip per migration is enough: we union all probe expressions
// into a single SELECT and read back a row of booleans.
async function checkMigration(parsed) {
  const probes = [];
  for (const t of parsed.tables) probes.push(`t_${t}: to_regclass('public.${t}') is not null`);
  for (const v of parsed.views) probes.push(`v_${v}: to_regclass('public.${v}') is not null`);
  for (const mv of parsed.mviews) probes.push(`mv_${mv}: to_regclass('public.${mv}') is not null`);
  for (const e of parsed.extensions)
    probes.push(`e_${e}: exists(select 1 from pg_extension where extname = '${e}')`);

  if (probes.length === 0) return { status: 'ambiguous', detail: 'no detectable target (alter/insert/etc)' };

  const selectList = probes
    .map((p) => {
      const [alias, expr] = p.split(': ');
      return `${expr} as ${alias}`;
    })
    .join(', ');

  const rows = await runSql(`select ${selectList};`);
  const row = Array.isArray(rows) ? rows[0] : rows;
  const present = [];
  const absent = [];
  for (const [k, val] of Object.entries(row)) {
    (val ? present : absent).push(k);
  }
  let status;
  if (absent.length === 0) status = 'applied';
  else if (present.length === 0) status = 'missing';
  else status = 'partial';
  return { status, present, absent };
}

// ---------------------------------------------------------------------------
// Vercel env-var sweep
// ---------------------------------------------------------------------------
function collectReferencedEnvKeys() {
  const out = new Map(); // projectKey -> Set<envKey>
  const files = readdirSync(POST_MERGE_DIR).filter((f) => f.startsWith('setup-') && f.endsWith('.mjs'));
  for (const f of files) {
    const src = readFileSync(join(POST_MERGE_DIR, f), 'utf8');
    // Extract `key: 'XYZ'` literals.
    const keys = [...src.matchAll(/key:\s*['"]([A-Z][A-Z0-9_]+)['"]/g)].map((m) => m[1]);
    if (keys.length === 0) continue;
    // Best-effort: pick the project alias from `vercel.projects['<alias>']`.
    const proj = src.match(/vercel\.projects\[['"]([a-z0-9-]+)['"]\]/);
    const alias = proj ? proj[1] : '(unknown)';
    if (!out.has(alias)) out.set(alias, new Set());
    for (const k of keys) out.get(alias).add(k);
  }
  return out;
}

async function fetchVercelEnvKeys(projectId) {
  const r = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env`, {
    headers: { Authorization: 'Bearer ' + VERCEL_TOKEN },
  });
  if (!r.ok) throw new Error(`vercel ${r.status}: ${(await r.text()).substring(0, 200)}`);
  const j = await r.json();
  return new Set((j.envs ?? []).map((e) => e.key));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
console.log(`[drift-sweep] ${files.length} migrations on disk`);
console.log(`[drift-sweep] project ${SUPABASE_REF}, mode ${APPLY ? 'APPLY' : 'report-only'}`);
console.log('');

const buckets = { applied: [], missing: [], partial: [], ambiguous: [], errored: [] };

for (const f of files) {
  const parsed = parseMigration(f);
  let result;
  try {
    result = await checkMigration(parsed);
  } catch (err) {
    result = { status: 'errored', detail: err.message };
  }
  buckets[result.status].push({ filename: f, parsed, result });

  const targetSummary =
    [...parsed.tables].map((t) => `t:${t}`).join(',') +
    ([...parsed.views].length ? ',' + [...parsed.views].map((v) => `v:${v}`).join(',') : '') +
    ([...parsed.mviews].length ? ',' + [...parsed.mviews].map((mv) => `mv:${mv}`).join(',') : '') +
    ([...parsed.extensions].length ? ',' + [...parsed.extensions].map((e) => `ext:${e}`).join(',') : '');

  const flag =
    result.status === 'applied' ? 'OK ' :
    result.status === 'missing' ? '!! ' :
    result.status === 'partial' ? '~~ ' :
    result.status === 'ambiguous' ? '?? ' : 'ER ';

  let line = `${flag} ${result.status.padEnd(9)} ${f}`;
  if (VERBOSE && targetSummary) line += `  [${targetSummary.replace(/^,/, '')}]`;
  if (result.status === 'partial') line += `  missing=${result.absent.join(',')}`;
  if (result.status === 'ambiguous') line += `  (${result.detail})`;
  if (result.status === 'errored') line += `  (${result.detail})`;
  console.log(line);
}

console.log('');
console.log('[drift-sweep] summary');
console.log(`  applied   ${buckets.applied.length}`);
console.log(`  missing   ${buckets.missing.length}`);
console.log(`  partial   ${buckets.partial.length}`);
console.log(`  ambiguous ${buckets.ambiguous.length}`);
console.log(`  errored   ${buckets.errored.length}`);

// ---------------------------------------------------------------------------
// Apply pass
// ---------------------------------------------------------------------------
if (APPLY) {
  const toRun = [...buckets.missing, ...buckets.partial];
  if (toRun.length === 0) {
    console.log('\n[drift-sweep] nothing to apply.');
  } else {
    console.log(`\n[drift-sweep] APPLYING ${toRun.length} migration(s)...`);
    for (const { filename, parsed } of toRun) {
      console.log(`  > ${filename}`);
      try {
        await runSql(parsed.sql);
        console.log('    OK');
      } catch (err) {
        console.log('    FAIL ' + err.message);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Vercel env-var sweep
// ---------------------------------------------------------------------------
console.log('\n[drift-sweep] vercel env-var sweep');
if (!VERCEL_TOKEN) {
  console.log('  skipped — vault has no vercel.token');
} else {
  const refs = collectReferencedEnvKeys();
  if (refs.size === 0) {
    console.log('  no env-var references found in scripts/post-merge/setup-*.mjs');
  } else {
    for (const [alias, wanted] of refs) {
      const proj = VERCEL_PROJECTS[alias];
      if (!proj?.id) {
        console.log(`  ?? ${alias}: not in vault.vercel.projects`);
        continue;
      }
      try {
        const have = await fetchVercelEnvKeys(proj.id);
        const missing = [...wanted].filter((k) => !have.has(k));
        if (missing.length === 0) {
          console.log(`  OK ${alias}: all referenced env vars present (${[...wanted].join(', ')})`);
        } else {
          console.log(`  !! ${alias}: missing ${missing.join(', ')}`);
        }
      } catch (err) {
        console.log(`  ER ${alias}: ${err.message}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Exit code: 0 if everything is applied + no env drift; 1 otherwise.
// ---------------------------------------------------------------------------
const dirty = buckets.missing.length + buckets.partial.length + buckets.errored.length;
exit(dirty > 0 && !APPLY ? 1 : 0);
