// Pulls generated TS types from Supabase Management API and writes them to packages/supabase-types/src/database.types.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const TOKEN = 'sbp_b41b87b61399c784d4056bf8a68ab4db4f584bce';
const PROJECT_REF = 'qfmeojeipncuxeltnvab';
const OUT = 'packages/supabase-types/src/database.types.ts';

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
