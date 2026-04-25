// Pulls generated TS types from Supabase Management API and writes them to packages/supabase-types/src/database.types.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'qfmeojeipncuxeltnvab';
const OUT = 'packages/supabase-types/src/database.types.ts';
if (!TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN not set. Export it before running this script.');
  process.exit(2);
}

const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/types/typescript?included_schemas=public`,
  { headers: { Authorization: `Bearer ${TOKEN}` } },
);
if (!res.ok) {
  console.error('failed', res.status, await res.text());
  process.exit(1);
}
const body = await res.json();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, body.types, 'utf8');
console.log(`[gen-types] wrote ${OUT} (${body.types.length} bytes)`);
