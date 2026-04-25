// Helper: deploy a Supabase Edge Function via Management API.
// Usage: node supabase/deploy-function.mjs <function-name>
// Reads source from supabase/functions/<name>/index.ts
import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

const TOKEN = 'sbp_b41b87b61399c784d4056bf8a68ab4db4f584bce';
const PROJECT_REF = 'qfmeojeipncuxeltnvab';

const name = argv[2];
if (!name) {
  console.error('usage: node deploy-function.mjs <function-name>');
  exit(2);
}

const sourcePath = `supabase/functions/${name}/index.ts`;
const source = readFileSync(sourcePath, 'utf8');

const form = new FormData();
form.append(
  'metadata',
  new Blob(
    [
      JSON.stringify({
        name,
        entrypoint_path: 'index.ts',
        verify_jwt: true,
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
