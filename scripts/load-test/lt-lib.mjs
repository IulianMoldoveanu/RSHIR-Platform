// Shared helpers for the Bucharest multi-vendor load test.
// Everything runs against the isolated Supabase branch, never production.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

export const REF = process.env.REF || 'wxkgaceidsyyjqeslbye';
const PROD_REF = 'qfmeojeipncuxeltnvab';
if (REF === PROD_REF) throw new Error('refusing to run the load test against production');

const TOKEN = JSON.parse(readFileSync(homedir() + '/.hir/secrets.json', 'utf8')).supabase.management_pat;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function sql(query, { retries = 4 } = {}) {
  let last;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res, text;
    try {
      res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      text = await res.text();
    } catch (e) {
      last = e.message;                       // network blip
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (res.ok) return text ? JSON.parse(text) : [];

    let msg = text;
    try { msg = JSON.parse(text).message ?? text; } catch {}
    msg = String(msg).replace(/\s+/g, ' ').slice(0, 400);
    // 5xx and the Cloudflare HTML error pages are gateway noise, not SQL errors —
    // the statement may not have run at all. Retry those; surface real SQL errors
    // (4xx with a Postgres SQLSTATE) immediately.
    const transient = res.status >= 500 || msg.startsWith('<!DOCTYPE');
    last = msg;
    if (!transient) throw new Error(msg);
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(`gateway kept failing after retries: ${last}`);
}

/** Same query, but returns {ok,error} instead of throwing — for concurrency runs
 *  where a failure is a result, not a crash. */
export async function trySql(query) {
  try { return { ok: true, rows: await sql(query) }; }
  catch (e) { return { ok: false, error: e.message }; }
}

export const s = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
export const j = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

// Deterministic RNG so a failing run can be reproduced exactly.
export function rng(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;  x >>>= 0;
    return x / 4294967296;
  };
}

// Bucharest bounding box, roughly inside the ring road.
export const BUC = { lat: 44.4268, lng: 26.1025 };
export const scatter = (r, spread = 0.055) => ({
  lat: +(BUC.lat + (r() - 0.5) * 2 * spread).toFixed(6),
  lng: +(BUC.lng + (r() - 0.5) * 2 * spread * 1.4).toFixed(6),
});

export function table(rows) {
  if (!rows.length) return '(no rows)';
  const cols = Object.keys(rows[0]);
  const w = cols.map((c) => Math.max(c.length, ...rows.map((x) => String(x[c] ?? '').length)));
  const line = (cells) => cells.map((c, i) => String(c ?? '').padEnd(w[i])).join('  ');
  return [line(cols), line(w.map((n) => '-'.repeat(n))), ...rows.map((x) => line(cols.map((c) => x[c])))].join('\n');
}
