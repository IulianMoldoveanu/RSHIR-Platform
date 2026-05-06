// Helper: deploy a Supabase Edge Function via Management API.
//
// Usage:
//   node supabase/deploy-function.mjs <function-name> [--verify-jwt=true|false] [--dry-run]
//
// Reads source from supabase/functions/<name>/index.ts.
//
// `verify_jwt` resolution (in order):
//   1. CLI flag `--verify-jwt=true|false` (explicit override, always wins).
//   2. Existing setting on the deployed function (GET first, preserve it).
//      This is the fix for the recurring footgun: token-only Edge Functions
//      (cron-style auth via shared secret) silently regressed to JWT-required
//      every time this script ran with the old hard-coded `verify_jwt:true`.
//   3. Fallback `true` if the function has never been deployed (matches the
//      historical default — new functions still default safe; deployer must
//      explicitly pass `--verify-jwt=false` for token-only first deploys).
//
// `--dry-run` prints the resolved metadata + intended action without calling
// the deploy endpoint. Useful for CI / pre-merge sanity checks.
import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'qfmeojeipncuxeltnvab';
if (!TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN not set. Export it before running this script.');
  exit(2);
}

// --- argv parsing -----------------------------------------------------------
const positional = [];
let cliVerifyJwt = null; // null = not specified
let dryRun = false;
for (const a of argv.slice(2)) {
  if (a === '--dry-run') dryRun = true;
  else if (a === '--verify-jwt=true') cliVerifyJwt = true;
  else if (a === '--verify-jwt=false') cliVerifyJwt = false;
  else if (a.startsWith('--verify-jwt=')) {
    console.error(`Invalid --verify-jwt value: ${a}. Expected --verify-jwt=true or --verify-jwt=false.`);
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
  console.error('usage: node deploy-function.mjs <function-name> [--verify-jwt=true|false] [--dry-run]');
  exit(2);
}

const sourcePath = `supabase/functions/${name}/index.ts`;
const source = readFileSync(sourcePath, 'utf8');

// --- resolve verify_jwt -----------------------------------------------------
async function fetchExistingVerifyJwt() {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/${name}`,
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  );
  if (res.status === 404) return { existed: false, verifyJwt: null };
  if (!res.ok) {
    const body = await res.text();
    console.error(`[deploy-function] GET /functions/${name} failed (${res.status}): ${body}`);
    exit(1);
  }
  const json = await res.json();
  return { existed: true, verifyJwt: Boolean(json.verify_jwt) };
}

// When the CLI flag explicitly sets verify_jwt, skip the GET entirely. This
// avoids requiring `edge_functions:read` on the access token (the Mgmt API
// scopes read + write separately) and honors the documented "CLI flag always
// wins" contract without an unnecessary round-trip. Per Codex review on
// PR #287.
let existed = null; // null = not probed
let existingVerifyJwt = null;
let verifyJwt;
let sourceOfDecision;
if (cliVerifyJwt !== null) {
  verifyJwt = cliVerifyJwt;
  sourceOfDecision = 'cli-flag';
} else {
  const probe = await fetchExistingVerifyJwt();
  existed = probe.existed;
  existingVerifyJwt = probe.verifyJwt;
  if (existed) {
    verifyJwt = existingVerifyJwt;
    sourceOfDecision = 'preserved-from-existing';
  } else {
    verifyJwt = true;
    sourceOfDecision = 'default-new-function';
  }
}

console.log(
  `[deploy-function] ${name}: verify_jwt=${verifyJwt} (${sourceOfDecision}); ` +
    `existed=${existed}; existing_verify_jwt=${existingVerifyJwt}`,
);

if (dryRun) {
  console.log(
    `[deploy-function] DRY RUN — would POST ${source.length} bytes to ` +
      `/v1/projects/${PROJECT_REF}/functions/deploy?slug=${name} with verify_jwt=${verifyJwt}. ` +
      `No request sent.`,
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
        entrypoint_path: 'index.ts',
        verify_jwt: verifyJwt,
      }),
    ],
    { type: 'application/json' },
  ),
);
form.append('file', new Blob([source], { type: 'application/typescript' }), 'index.ts');

console.log(`[deploy-function] uploading ${sourcePath} (${source.length} bytes) as ${name}`);

const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/deploy?slug=${name}`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  },
);

const text = await res.text();
console.log(`[deploy-function] status ${res.status}`);
console.log(text);
if (!res.ok) exit(1);
