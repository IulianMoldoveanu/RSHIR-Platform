// Post-merge bootstrap for Lane SENTRY-ALERTS.
//
// Adds the missing alert rules on every RSHIR Sentry project so the existing
// `webhooks` plugin (already pointed at the `sentry-webhook-intake` Edge Function)
// fires Telegram for the categories Iulian asked for.
//
//   node scripts/post-merge/setup-sentry-alerts.mjs            # write
//   node scripts/post-merge/setup-sentry-alerts.mjs --dry-run  # preview only
//
// Idempotent: rules are matched by exact `name`. If a rule with the same name
// already exists on a project it is skipped (no overwrite, no duplicate).
//
// Existing rules from Lane K (volume burst / first-seen / high-volume) are left
// untouched. This script ONLY adds the four new rules described in
// docs/SENTRY_ALERT_RULES.md.
//
// Vault keys consumed:
//   sentry.auth_token  – org-scoped PAT
//   sentry.org_slug    – e.g. hirbuild-your-dreams
//   sentry.region      – "EU (de.sentry.io)" or "US (sentry.io)"

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DRY_RUN = process.argv.includes('--dry-run');

const vault = JSON.parse(readFileSync(join(homedir(), '.hir', 'secrets.json'), 'utf8'));
const TOKEN = vault.sentry?.auth_token;
const ORG = vault.sentry?.org_slug;
const REGION_RAW = vault.sentry?.region || 'EU (de.sentry.io)';

if (!TOKEN || !ORG) {
  console.error('Missing sentry.auth_token or sentry.org_slug in ~/.hir/secrets.json');
  process.exit(1);
}

// Region string in vault is e.g. "EU (de.sentry.io)"; extract the host.
const HOST_MATCH = REGION_RAW.match(/([a-z0-9.-]+sentry\.io)/i);
const HOST = HOST_MATCH ? HOST_MATCH[1] : 'sentry.io';
const API = `https://${HOST}/api/0`;

const PROJECTS = [
  'rshir-customer',
  'rshir-vendor',
  'rshir-courier',
  'rshir-admin',
  'rshir-backend',
];

// Rule definitions. Each rule fires the existing webhooks plugin (which already
// points at sentry-webhook-intake?token=…). Telegram routing is decided by the
// Edge Function based on issue level, not by rule.
//
// `appliesTo`: subset of PROJECTS, or null = all 5.
// Rule frequency = minimum minutes between fires per issue (Sentry quota guard).
const RULES = [
  {
    // Sentry condition match is set via `actionMatch`; we want ANY of these
    // first/regress/reappear triggers to fire, then the level filter narrows
    // to fatal only.
    name: 'RSHIR · Fatal-level issue (any occurrence)',
    appliesTo: null,
    frequency: 5,
    body: {
      actionMatch: 'any',
      filterMatch: 'all',
      conditions: [
        { id: 'sentry.rules.conditions.first_seen_event.FirstSeenEventCondition' },
        { id: 'sentry.rules.conditions.reappeared_event.ReappearedEventCondition' },
        { id: 'sentry.rules.conditions.regression_event.RegressionEventCondition' },
      ],
      filters: [
        {
          id: 'sentry.rules.filters.level.LevelFilter',
          match: 'eq',
          level: '50', // 50 = fatal in Sentry
        },
      ],
      actions: [
        {
          id: 'sentry.rules.actions.notify_event_service.NotifyEventServiceAction',
          service: 'webhooks',
        },
      ],
    },
  },
  {
    name: 'RSHIR · Payment failure tag',
    appliesTo: null,
    frequency: 5,
    body: {
      actionMatch: 'any',
      filterMatch: 'all',
      conditions: [
        { id: 'sentry.rules.conditions.first_seen_event.FirstSeenEventCondition' },
        { id: 'sentry.rules.conditions.reappeared_event.ReappearedEventCondition' },
        { id: 'sentry.rules.conditions.regression_event.RegressionEventCondition' },
      ],
      filters: [
        {
          id: 'sentry.rules.filters.tagged_event.TaggedEventFilter',
          match: 'eq',
          key: 'payment_failure',
          value: 'true',
        },
      ],
      actions: [
        {
          id: 'sentry.rules.actions.notify_event_service.NotifyEventServiceAction',
          service: 'webhooks',
        },
      ],
    },
  },
  {
    name: 'RSHIR · Stripe or webhook keyword in title',
    appliesTo: null,
    frequency: 5,
    body: {
      actionMatch: 'any',
      filterMatch: 'any',
      conditions: [
        { id: 'sentry.rules.conditions.first_seen_event.FirstSeenEventCondition' },
        { id: 'sentry.rules.conditions.reappeared_event.ReappearedEventCondition' },
        { id: 'sentry.rules.conditions.regression_event.RegressionEventCondition' },
      ],
      filters: [
        {
          id: 'sentry.rules.filters.event_attribute.EventAttributeFilter',
          match: 'co',
          attribute: 'message',
          value: 'Stripe',
        },
        {
          id: 'sentry.rules.filters.event_attribute.EventAttributeFilter',
          match: 'co',
          attribute: 'message',
          value: 'webhook',
        },
      ],
      actions: [
        {
          id: 'sentry.rules.actions.notify_event_service.NotifyEventServiceAction',
          service: 'webhooks',
        },
      ],
    },
  },
  {
    // Stricter than existing 25/5min volume-burst — backend only, where 5xx
    // and Stripe webhook errors live. Adding to UI projects would generate
    // Telegram noise from end-user devices (Safari fetch drops, AbortError, ...).
    name: 'RSHIR · Backend error volume (≥5 / 5 min)',
    appliesTo: ['rshir-backend'],
    frequency: 30,
    body: {
      actionMatch: 'all',
      filterMatch: 'all',
      conditions: [
        {
          id: 'sentry.rules.conditions.event_frequency.EventFrequencyCondition',
          comparisonType: 'count',
          interval: '5m',
          value: 5,
        },
      ],
      filters: [
        {
          id: 'sentry.rules.filters.level.LevelFilter',
          match: 'gte',
          level: '40', // 40 = error
        },
      ],
      actions: [
        {
          id: 'sentry.rules.actions.notify_event_service.NotifyEventServiceAction',
          service: 'webhooks',
        },
      ],
    },
  },
];

async function api(method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: r.status, ok: r.ok, json, body: text };
}

async function listRules(project) {
  const r = await api('GET', `/projects/${ORG}/${project}/rules/`);
  if (!r.ok) throw new Error(`list rules ${project}: ${r.status} ${r.body.slice(0, 200)}`);
  return Array.isArray(r.json) ? r.json : [];
}

async function createRule(project, ruleDef) {
  const payload = {
    ...ruleDef.body,
    name: ruleDef.name,
    frequency: ruleDef.frequency,
    environment: null,
  };
  const r = await api('POST', `/projects/${ORG}/${project}/rules/`, payload);
  if (!r.ok) {
    throw new Error(`create rule "${ruleDef.name}" on ${project}: ${r.status} ${r.body.slice(0, 400)}`);
  }
  return r.json;
}

async function ensurePluginEnabled(project) {
  const r = await api('GET', `/projects/${ORG}/${project}/plugins/webhooks/`);
  if (!r.ok) {
    console.warn(`[${project}] webhooks plugin status ${r.status} — skipping plugin check`);
    return false;
  }
  if (!r.json?.enabled) {
    console.warn(`[${project}] WARNING: webhooks plugin is NOT enabled — alerts will not fire`);
    return false;
  }
  const urls = r.json.config?.find((c) => c.name === 'urls')?.value;
  if (!urls || !urls.includes('sentry-webhook-intake')) {
    console.warn(`[${project}] WARNING: webhooks plugin URL not pointed at sentry-webhook-intake — got: ${urls}`);
    return false;
  }
  return true;
}

console.log(`[sentry-alerts] org=${ORG} host=${HOST} dryRun=${DRY_RUN}`);

let created = 0;
let skipped = 0;
let pluginIssues = 0;

for (const project of PROJECTS) {
  const pluginOk = await ensurePluginEnabled(project);
  if (!pluginOk) pluginIssues++;

  const existing = await listRules(project);
  const existingNames = new Set(existing.map((r) => r.name));

  for (const rule of RULES) {
    if (rule.appliesTo && !rule.appliesTo.includes(project)) {
      continue;
    }
    if (existingNames.has(rule.name)) {
      console.log(`[${project}] skip: "${rule.name}" already exists`);
      skipped++;
      continue;
    }
    if (DRY_RUN) {
      console.log(`[${project}] would create: "${rule.name}"`);
      continue;
    }
    try {
      const made = await createRule(project, rule);
      console.log(`[${project}] created: id=${made.id} "${rule.name}"`);
      created++;
    } catch (e) {
      console.error(`[${project}] FAILED: ${e.message}`);
      process.exitCode = 1;
    }
  }
}

console.log(`\n[sentry-alerts] done — created=${created} skipped=${skipped} pluginIssues=${pluginIssues}`);
if (pluginIssues > 0 && !DRY_RUN) {
  console.warn('[sentry-alerts] note: at least one project had a webhooks-plugin issue; rules created but may not deliver until that is fixed in the Sentry UI.');
}
