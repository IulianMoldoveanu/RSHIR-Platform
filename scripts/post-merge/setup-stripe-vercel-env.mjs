// Post-merge: prepare Stripe env-var slots on the hir-restaurant-web Vercel
// project. Creates slots with empty placeholder values when missing — Iulian
// fills them from his Stripe dashboard later, no redeploy needed beyond the
// existing CI cycle.
//
// Why "create empty": Vercel rejects empty strings via the API, so we set a
// placeholder `__SET_FROM_STRIPE_DASHBOARD__`. The webhook handler returns
// 503 webhook_not_configured when the placeholder is still in place, so we
// fail loud rather than silently process unauthenticated callers.
//
//   node "C:/Users/Office HIR CEO/Desktop/AI Projects/RSHIR-claude-wt-laneG/scripts/post-merge/setup-stripe-vercel-env.mjs"

import { readFileSync } from 'node:fs';

const VAULT_PATH = 'C:/Users/Office HIR CEO/.hir/secrets.json';
const v = JSON.parse(readFileSync(VAULT_PATH, 'utf8'));
const TOKEN = v.vercel.token;
const PROJECT_ID = v.vercel.projects['hir-restaurant-web'];
const TEAM = v.vercel.scope || null;

if (!PROJECT_ID) {
  console.error('[stripe-vercel-env] hir-restaurant-web project id missing from vault');
  process.exit(1);
}

const PLACEHOLDER = '__SET_FROM_STRIPE_DASHBOARD__';

// Vercel env-var spec. `target` covers all 3 deploy contexts so a preview
// deploy gets the keys too (useful for branch previews of Stripe-touching
// PRs once Iulian wires the real test keys).
const SLOTS = [
  { key: 'STRIPE_SECRET_KEY', type: 'encrypted' },
  { key: 'STRIPE_WEBHOOK_SECRET', type: 'encrypted' },
  { key: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', type: 'plain' },
];

const teamQs = TEAM ? `?teamId=${encodeURIComponent(TEAM)}` : '';

async function listEnv() {
  const r = await fetch(`https://api.vercel.com/v9/projects/${PROJECT_ID}/env${teamQs}`, {
    headers: { Authorization: 'Bearer ' + TOKEN },
  });
  if (!r.ok) throw new Error(`list env failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return new Set((j.envs || []).map((e) => e.key));
}

const existing = await listEnv();
console.log('[stripe-vercel-env] existing env keys count:', existing.size);

for (const slot of SLOTS) {
  if (existing.has(slot.key)) {
    console.log(`[stripe-vercel-env] ${slot.key}: already exists, skipping`);
    continue;
  }
  const body = {
    key: slot.key,
    value: PLACEHOLDER,
    type: slot.type,
    target: ['production', 'preview', 'development'],
  };
  const r = await fetch(`https://api.vercel.com/v10/projects/${PROJECT_ID}/env${teamQs}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    console.error(`[stripe-vercel-env] ${slot.key} create failed:`, r.status, await r.text());
    continue;
  }
  console.log(`[stripe-vercel-env] ${slot.key}: created with placeholder`);
}

console.log('\n[stripe-vercel-env] DONE.');
console.log('Iulian: open Vercel → hir-restaurant-web → Settings → Environment Variables');
console.log('  Replace the 3 __SET_FROM_STRIPE_DASHBOARD__ values with your Stripe TEST keys.');
console.log('  After save, redeploy is automatic on next push.');
