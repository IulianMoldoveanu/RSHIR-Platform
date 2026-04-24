// One-off helper to POST a SQL file to Supabase Management API.
// Usage: node supabase/apply-sql.mjs <path-to-sql>
import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

const TOKEN = 'sbp_b41b87b61399c784d4056bf8a68ab4db4f584bce';
const PROJECT_REF = 'qfmeojeipncuxeltnvab';

const file = argv[2];
if (!file) {
  console.error('usage: node apply-sql.mjs <file.sql>');
  exit(2);
}

const sql = readFileSync(file, 'utf8');
console.log(`[apply-sql] POST ${file} (${sql.length} bytes) to project ${PROJECT_REF}`);

const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  },
);

const text = await res.text();
console.log(`[apply-sql] status ${res.status}`);
console.log(text);
if (!res.ok) exit(1);
