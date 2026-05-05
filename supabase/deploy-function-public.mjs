// Deploy a Supabase Edge Function with verify_jwt=false (for webhook receivers).
// Usage: node supabase/deploy-function-public.mjs <function-name>
import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'qfmeojeipncuxeltnvab';
if (!TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN not set.');
  exit(2);
}

const name = argv[2];
if (!name) {
  console.error('usage: node deploy-function-public.mjs <function-name>');
  exit(2);
}

const sourcePath = `supabase/functions/${name}/index.ts`;
const source = readFileSync(sourcePath, 'utf8');

const form = new FormData();
form.append(
  'metadata',
  new Blob(
    [JSON.stringify({ name, entrypoint_path: 'index.ts', verify_jwt: false })],
    { type: 'application/json' },
  ),
);
form.append('file', new Blob([source], { type: 'application/typescript' }), 'index.ts');

console.log(`[deploy-function-public] ${sourcePath} → ${name} (verify_jwt=false)`);

const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/deploy?slug=${name}`,
  { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: form },
);

const text = await res.text();
console.log(`[deploy-function-public] status ${res.status}`);
console.log(text);
if (!res.ok) exit(1);
