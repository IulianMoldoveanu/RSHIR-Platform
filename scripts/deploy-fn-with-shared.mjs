// HIR Restaurant Suite — deploy a Supabase Edge Function that imports from
// `_shared/`.
//
// Companion to `supabase/deploy-function.mjs` (single-file deploy). Use this
// helper when the function imports anything from `../_shared/*` (e.g. the
// `withRunLog` observability wrap added in Lane 9). The single-file deployer
// only ships `index.ts` and the resulting bundle 502s with `Module not found
// "../_shared/log.ts"` at cold start.
//
// Usage:
//   node scripts/deploy-fn-with-shared.mjs <function-name> \
//     [--verify-jwt=preserve|true|false] [--dry-run]
//
// Env:
//   SUPABASE_ACCESS_TOKEN   required — Supabase Management API PAT
//   SUPABASE_PROJECT_REF    optional, defaults to qfmeojeipncuxeltnvab
//
// `verify_jwt` resolution (matches `supabase/deploy-function.mjs` after
// PR #287, with `preserve` as the explicit default):
//   --verify-jwt=true|false  → CLI flag wins (no GET round-trip — read scope
//                              not required, see LESSONS 2026-05-06).
//   --verify-jwt=preserve    → GET existing setting, preserve it. New
//                              functions default to `true` if not deployed.
//   (unset)                  → same as `preserve`.
//
// `--dry-run` prints the resolved bundle layout + verify_jwt decision and
// exits without calling the deploy endpoint.
//
// Bundle layout sent to the Mgmt API:
//   metadata.entrypoint_path = "<fn-name>/index.ts"
//   file part 1               = "<fn-name>/index.ts"
//   file parts 2..n           = "_shared/<helper>.ts" for each helper that
//                                index.ts directly imports via `from
//                                "../_shared/<helper>.ts"`. NOT a recursive
//                                walk — if a helper imports another helper,
//                                add it to the grep below or extend the
//                                resolver.

import { readFileSync, existsSync } from 'node:fs';
import { argv, env, exit } from 'node:process';

const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = env.SUPABASE_PROJECT_REF ?? 'qfmeojeipncuxeltnvab';
if (!TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN not set. Export it before running this script.');
  exit(2);
}

// --- argv parsing -----------------------------------------------------------
const positional = [];
let cliVerifyJwt = 'preserve'; // 'preserve' | true | false
let dryRun = false;
for (const a of argv.slice(2)) {
  if (a === '--dry-run') dryRun = true;
  else if (a === '--verify-jwt=true') cliVerifyJwt = true;
  else if (a === '--verify-jwt=false') cliVerifyJwt = false;
  else if (a === '--verify-jwt=preserve') cliVerifyJwt = 'preserve';
  else if (a.startsWith('--verify-jwt=')) {
    console.error(
      `Invalid --verify-jwt value: ${a}. Expected --verify-jwt=preserve|true|false.`,
    );
    exit(2);
  } else if (a.startsWith('--')) {
    console.error(`Unknown flag: ${a}`);
    exit(2);
  } else {
    positional.push(a);
  }
}

const name = positional[0];
if (!name) {
  console.error(
    'usage: node scripts/deploy-fn-with-shared.mjs <function-name> ' +
      '[--verify-jwt=preserve|true|false] [--dry-run]',
  );
  exit(2);
}

// --- read function source + shared deps ------------------------------------
const indexPath = `supabase/functions/${name}/index.ts`;
if (!existsSync(indexPath)) {
  console.error(`[deploy-fn-with-shared] not found: ${indexPath}`);
  exit(2);
}
const indexSource = readFileSync(indexPath, 'utf8');

// Find all `from "../_shared/<file>.ts"` imports in index.ts (single + double
// quotes). Non-recursive — if a helper imports another helper, this
// resolver does not follow.
const sharedRe = /from\s+['"]\.\.\/_shared\/([A-Za-z0-9_\-./]+)['"]/g;
const sharedFiles = new Set();
for (const m of indexSource.matchAll(sharedRe)) {
  sharedFiles.add(m[1]);
}

const sharedSources = [];
for (const rel of sharedFiles) {
  const path = `supabase/functions/_shared/${rel}`;
  if (!existsSync(path)) {
    console.error(`[deploy-fn-with-shared] referenced helper not found: ${path}`);
    exit(2);
  }
  sharedSources.push({ rel, path, source: readFileSync(path, 'utf8') });
}

// --- resolve verify_jwt -----------------------------------------------------
async function fetchExisting() {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/${name}`,
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  );
  if (res.status === 404) return { existed: false, verifyJwt: null, version: null };
  if (!res.ok) {
    const body = await res.text();
    console.error(
      `[deploy-fn-with-shared] GET /functions/${name} failed (${res.status}): ${body}`,
    );
    exit(1);
  }
  const json = await res.json();
  return {
    existed: true,
    verifyJwt: Boolean(json.verify_jwt),
    version: json.version ?? null,
  };
}

let existed = null;
let existingVerifyJwt = null;
let existingVersion = null;
let verifyJwt;
let sourceOfDecision;
if (cliVerifyJwt === true || cliVerifyJwt === false) {
  verifyJwt = cliVerifyJwt;
  sourceOfDecision = 'cli-flag';
} else {
  const probe = await fetchExisting();
  existed = probe.existed;
  existingVerifyJwt = probe.verifyJwt;
  existingVersion = probe.version;
  if (existed) {
    verifyJwt = existingVerifyJwt;
    sourceOfDecision = 'preserved-from-existing';
  } else {
    verifyJwt = true;
    sourceOfDecision = 'default-new-function';
  }
}

// --- report -----------------------------------------------------------------
const totalBytes =
  indexSource.length + sharedSources.reduce((s, h) => s + h.source.length, 0);
console.log(
  `[deploy-fn-with-shared] ${name}: verify_jwt=${verifyJwt} (${sourceOfDecision}); ` +
    `existed=${existed}; existing_verify_jwt=${existingVerifyJwt}; ` +
    `existing_version=${existingVersion}`,
);
console.log(
  `[deploy-fn-with-shared] bundle: ${name}/index.ts (${indexSource.length} B) + ` +
    `${sharedSources.length} shared helper(s)` +
    (sharedSources.length
      ? ': ' + sharedSources.map((h) => `_shared/${h.rel} (${h.source.length} B)`).join(', ')
      : ''),
);
console.log(`[deploy-fn-with-shared] total payload: ${totalBytes} bytes`);

if (dryRun) {
  console.log(
    `[deploy-fn-with-shared] DRY RUN — would POST to ` +
      `/v1/projects/${PROJECT_REF}/functions/deploy?slug=${name}. No request sent.`,
  );
  exit(0);
}

// --- deploy -----------------------------------------------------------------
const form = new FormData();
form.append(
  'metadata',
  new Blob(
    [
      JSON.stringify({
        name,
        entrypoint_path: `${name}/index.ts`,
        verify_jwt: verifyJwt,
      }),
    ],
    { type: 'application/json' },
  ),
);
form.append(
  'file',
  new Blob([indexSource], { type: 'application/typescript' }),
  `${name}/index.ts`,
);
for (const h of sharedSources) {
  form.append(
    'file',
    new Blob([h.source], { type: 'application/typescript' }),
    `_shared/${h.rel}`,
  );
}

const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/deploy?slug=${name}`,
  { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: form },
);

const text = await res.text();
console.log(`[deploy-fn-with-shared] status ${res.status}`);
console.log(text);
if (!res.ok) exit(1);

// Best-effort post-deploy probe: print the new version + active state so the
// caller can confirm it landed without an extra `gh`/`curl` step.
try {
  const after = await fetchExisting();
  console.log(
    `[deploy-fn-with-shared] post-deploy: existed=${after.existed} ` +
      `version=${after.version} verify_jwt=${after.verifyJwt}`,
  );
} catch (e) {
  console.warn(`[deploy-fn-with-shared] post-deploy probe failed: ${(e && e.message) || e}`);
}
