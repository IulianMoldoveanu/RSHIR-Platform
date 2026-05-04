// Smoke test for sentry-webhook-intake Edge Function.
// Posts a synthetic Sentry issue-alert payload and verifies the response.
// Pass `--live` to fire a real Telegram (default is dry-run).
//
// Usage:
//   node scripts/smoke-sentry-webhook.mjs            # dry-run, no Telegram
//   node scripts/smoke-sentry-webhook.mjs --live     # send to Telegram

import { argv, exit } from 'node:process';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://qfmeojeipncuxeltnvab.supabase.co';
const SECRET = process.env.SENTRY_WEBHOOK_SECRET;
if (!SECRET) {
  console.error('SENTRY_WEBHOOK_SECRET env not set');
  exit(2);
}

const live = argv.includes('--live');
const project = argv.includes('--project') ? argv[argv.indexOf('--project') + 1] : 'rshir-customer';

const payload = {
  action: 'created',
  data: {
    issue: {
      id: `smoke-${Date.now()}`,
      title: live
        ? 'Lane K test: real Sentry alert wiring smoke'
        : 'Lane K dry-run: synthetic Sentry alert (no Telegram)',
      level: 'error',
      url: `https://hirbuild-your-dreams.sentry.io/issues/smoke-${Date.now()}/`,
      web_url: `https://hirbuild-your-dreams.sentry.io/issues/smoke-${Date.now()}/`,
      count: 7,
      userCount: 3,
      project: { slug: project },
    },
    triggered_rule: 'Lane K smoke rule',
    event: { environment: 'production', release: 'lane-k-smoke' },
  },
  project_slug: project,
  installation: { uuid: 'smoke-installation' },
};

const url = new URL(`${SUPABASE_URL}/functions/v1/sentry-webhook-intake`);
url.searchParams.set('token', SECRET);
if (!live) url.searchParams.set('dry_run', '1');

console.log(`[smoke] POST ${url.toString().replace(SECRET, '<TOKEN>')}`);
const r = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
const text = await r.text();
console.log(`[smoke] status ${r.status}`);
console.log(text);
if (!r.ok) exit(1);
