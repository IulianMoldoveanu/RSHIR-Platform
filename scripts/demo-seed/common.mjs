// Shared helpers for demo-seed scripts.
//
// Loads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from env or ~/.hir/secrets.json.
// Provides a deterministic RNG, SQL escape helpers, and the Supabase Management
// API SQL runner.

import { env, exit } from 'node:process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ---- secrets resolution ----------------------------------------------------
export function loadSecrets() {
  const fromEnv = {
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_PROJECT_REF: env.SUPABASE_PROJECT_REF,
    SUPABASE_MANAGEMENT_PAT: env.SUPABASE_MANAGEMENT_PAT ?? env.SUPABASE_ACCESS_TOKEN,
  };
  if (
    fromEnv.SUPABASE_URL &&
    fromEnv.SUPABASE_SERVICE_ROLE_KEY &&
    (fromEnv.SUPABASE_PROJECT_REF || fromEnv.SUPABASE_MANAGEMENT_PAT)
  ) {
    return fromEnv;
  }

  // Fallback: ~/.hir/secrets.json
  const vaultPath = join(homedir(), '.hir', 'secrets.json');
  if (!existsSync(vaultPath)) {
    console.error(
      '[demo-seed] missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env and no vault at ' +
        vaultPath,
    );
    exit(2);
  }
  let vault;
  try {
    vault = JSON.parse(readFileSync(vaultPath, 'utf8'));
  } catch (err) {
    console.error('[demo-seed] failed to parse vault: ' + err.message);
    exit(2);
  }
  const sb = vault.supabase ?? {};
  return {
    SUPABASE_URL: fromEnv.SUPABASE_URL ?? sb.url,
    SUPABASE_SERVICE_ROLE_KEY: fromEnv.SUPABASE_SERVICE_ROLE_KEY ?? sb.service_role_key,
    SUPABASE_PROJECT_REF: fromEnv.SUPABASE_PROJECT_REF ?? sb.project_ref,
    SUPABASE_MANAGEMENT_PAT:
      fromEnv.SUPABASE_MANAGEMENT_PAT ?? sb.management_pat ?? null,
  };
}

// ---- SQL runner via Management API ----------------------------------------
// Uses the Management API SQL endpoint (same as scripts/seed-demo-scenario.mjs).
// Requires SUPABASE_MANAGEMENT_PAT + SUPABASE_PROJECT_REF.
export async function makeSqlRunner(secrets, { dryRun = false } = {}) {
  if (dryRun) {
    return async (query) => {
      // Truncate noisy SQL in dry-run output (full payload still goes through
      // the script's own logic). Print only first 500 chars + size summary.
      const head = query.length > 500 ? query.slice(0, 500) + '\n... [truncated, total ' + query.length + ' chars]' : query;
      console.log('--- DRY RUN SQL ---');
      console.log(head);
      console.log('--- END SQL ---');
      // Stub responses to let the caller proceed past pre-flight reads.
      if (/from public\.tenants/i.test(query) && /slug = /i.test(query)) {
        return [{
          id: '00000000-0000-0000-0000-000000000000',
          slug: 'dry-run',
          name: 'Dry Run Tenant',
          status: 'ACTIVE',
        }];
      }
      // Snapshot/summary queries that probe count(*) — return non-zero so the
      // dry-run can proceed past pre-flight gates.
      if (/menu_items/i.test(query) && /count\(\*\)/i.test(query) && /is_available/i.test(query)) {
        return [{ demo_customers: 0, demo_orders: 0, menu_items: 50, zones: 2, demo_affiliate_apps: 0 }];
      }
      // Menu items pull
      if (/restaurant_menu_items i/.test(query) && /price_ron/.test(query)) {
        const stub = [];
        for (let i = 0; i < 50; i++) {
          stub.push({
            id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
            name: ['Mușchi de Vită', 'Mici', 'Pulpă Pui Grătar', 'Burger Casa', 'Pizza Quattro', 'Cordon Bleu', 'Ceafă Porc', 'Salată Caesar'][i % 8] + ` #${i}`,
            price: 25 + (i % 8) * 5,
            cat: ['Preparate din Vită', 'Românisme', 'Preparate din Pui', 'Burgeri', 'Pizza 32 cm', 'Preparate din Porc', 'Salate'][i % 7],
          });
        }
        return stub;
      }
      // Zone pull
      if (/from public\.delivery_zones/.test(query) && /is_active/.test(query)) {
        return [
          { id: '11111111-1111-1111-1111-111111111111' },
          { id: '22222222-2222-2222-2222-222222222222' },
        ];
      }
      // courier_profiles user_id lookup (cleanup script)
      if (/from public\.courier_profiles/.test(query) && /user_id/.test(query)) {
        return [{ user_id: '00000000-d3a1-4ec0-aa00-000000000c01' }];
      }
      return [{}];
    };
  }
  if (!secrets.SUPABASE_MANAGEMENT_PAT || !secrets.SUPABASE_PROJECT_REF) {
    console.error(
      '[demo-seed] need SUPABASE_MANAGEMENT_PAT + SUPABASE_PROJECT_REF for SQL runs',
    );
    exit(2);
  }
  return async (query) => {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${secrets.SUPABASE_PROJECT_REF}/database/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secrets.SUPABASE_MANAGEMENT_PAT}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      },
    );
    const text = await res.text();
    if (!res.ok) {
      console.error(`[demo-seed] SQL failed (HTTP ${res.status})`);
      console.error(text);
      exit(1);
    }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };
}

// ---- deterministic RNG (mulberry32) ---------------------------------------
export function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed = 42) {
  const r = mulberry32(seed);
  return {
    next: r,
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    randInt: (lo, hi) => Math.floor(r() * (hi - lo + 1)) + lo,
    weighted: (pairs) => {
      const total = pairs.reduce((a, [, w]) => a + w, 0);
      let x = r() * total;
      for (const [v, w] of pairs) {
        if ((x -= w) <= 0) return v;
      }
      return pairs[pairs.length - 1][0];
    },
  };
}

// ---- SQL escape helpers ---------------------------------------------------
export function sqlStr(s) {
  if (s === null || s === undefined) return 'null';
  return `'${String(s).replace(/'/g, "''")}'`;
}

export function sqlJson(o) {
  return `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
}

// Format a JS Date as a SQL literal timestamptz.
export function sqlTs(date) {
  return `'${date.toISOString()}'::timestamptz`;
}

// ---- demo markers (cleanup contract) --------------------------------------
// Every script in this folder writes rows tagged with one of these markers so
// cleanup-foisorul-a.mjs can identify + delete them safely.
export const DEMO_MARKERS = {
  // restaurant_orders.notes prefix
  ORDER_NOTES_PREFIX: '[DEMO_SEED]',
  // customers.email pattern (suffix)
  CUSTOMER_EMAIL_DOMAIN: '@hir-demo.ro',
  // customers.phone numeric prefix (literal "+4070000")
  CUSTOMER_PHONE_PREFIX: '+4070000',
  // courier_profiles.phone prefix
  COURIER_PHONE_PREFIX: '+4070099',
  // courier_orders.source_order_id prefix
  COURIER_ORDER_PREFIX: 'DEMO-SEED-',
  // affiliate_applications.email suffix
  AFFILIATE_EMAIL_DOMAIN: '@hir-demo.ro',
  // auth.users email suffix used for demo couriers
  COURIER_AUTH_EMAIL_DOMAIN: '@hir-demo.ro',
};
