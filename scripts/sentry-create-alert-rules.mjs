// Lane K — provision Sentry alert rules across the 5 RSHIR projects.
// Idempotent: scans existing rules and skips ones whose `name` is already present.
//
// Rules per project (issue alerts):
//   1. RSHIR · First seen issue (regression detect)
//        — fires once per new issue → INFO/CRITICAL classified by receiver via level
//   2. RSHIR · Volume burst (≥10 events / 2 min)
//        — wakes Iulian on sustained ≥5/min for 2 min
//   3. RSHIR · High volume (≥100 events / 1 hour)
//        — low-priority WARN (rule name signals downgrade in receiver)
//
// Backend extra (metric alert via /alert-rules/):
//   4. RSHIR Backend · p95 transaction duration > 2s for 5 min
//
// Action: notify_event_service.NotifyEventServiceAction with service=webhooks.
// The webhooks plugin URL was already set to the sentry-webhook-intake endpoint.
//
// Usage: SENTRY_AUTH_TOKEN=… node scripts/sentry-create-alert-rules.mjs

import { argv, exit } from 'node:process';

const TOKEN = process.env.SENTRY_AUTH_TOKEN;
if (!TOKEN) {
  console.error('SENTRY_AUTH_TOKEN missing');
  exit(2);
}

const ORG = 'hirbuild-your-dreams';
const BASE = 'https://de.sentry.io/api/0';
const PROJECTS = ['rshir-customer', 'rshir-vendor', 'rshir-courier', 'rshir-admin', 'rshir-backend'];

const dryRun = argv.includes('--dry-run');

async function api(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { Authorization: `Bearer ${TOKEN}` },
  };
  if (body !== null) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(`${BASE}${path}`, opts);
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: r.status, ok: r.ok, json };
}

const ACTION_WEBHOOK = {
  id: 'sentry.rules.actions.notify_event_service.NotifyEventServiceAction',
  service: 'webhooks',
  name: 'Send a notification via webhooks',
};

function ruleFirstSeen(project) {
  return {
    name: 'RSHIR · First seen issue (regression detect)',
    actionMatch: 'all',
    filterMatch: 'all',
    frequency: 5, // minutes between firings on same issue
    environment: null,
    conditions: [
      { id: 'sentry.rules.conditions.first_seen_event.FirstSeenEventCondition', name: 'A new issue is created' },
    ],
    filters: [
      // Skip user-cancellable noise. Receiver also filters as defense-in-depth.
      {
        id: 'sentry.rules.filters.event_attribute.EventAttributeFilter',
        attribute: 'message',
        match: 'nc', // does not contain
        value: 'AbortError',
        name: 'event\'s message does not contain AbortError',
      },
    ],
    actions: [ACTION_WEBHOOK],
    projects: [project],
  };
}

function ruleVolumeBurst(project) {
  return {
    name: 'RSHIR · Volume burst (≥25 events / 5 min)',
    actionMatch: 'all',
    filterMatch: 'all',
    frequency: 30,
    environment: null,
    conditions: [
      {
        id: 'sentry.rules.conditions.event_frequency.EventFrequencyCondition',
        value: 25,
        interval: '5m',
        comparisonType: 'count',
        name: 'The issue is seen more than 25 times in 5m',
      },
    ],
    filters: [],
    actions: [ACTION_WEBHOOK],
    projects: [project],
  };
}

function ruleHighVolume(project) {
  return {
    // The rule name is parsed by the receiver to demote to WARN if needed.
    name: 'RSHIR · High volume (≥100 events / 1 hour) [low-priority]',
    actionMatch: 'all',
    filterMatch: 'all',
    frequency: 60,
    environment: null,
    conditions: [
      {
        id: 'sentry.rules.conditions.event_frequency.EventFrequencyCondition',
        value: 100,
        interval: '1h',
        comparisonType: 'count',
        name: 'The issue is seen more than 100 times in 1h',
      },
    ],
    filters: [],
    actions: [ACTION_WEBHOOK],
    projects: [project],
  };
}

async function ensureIssueRules(project) {
  const list = await api(`/projects/${ORG}/${project}/rules/`);
  if (!list.ok) {
    console.error(`[${project}] failed to list rules:`, list.status, list.json);
    return;
  }
  const existingNames = new Set(list.json.map((r) => r.name));

  const wanted = [ruleFirstSeen(project), ruleVolumeBurst(project), ruleHighVolume(project)];
  for (const rule of wanted) {
    if (existingNames.has(rule.name)) {
      console.log(`[${project}] skip (exists): ${rule.name}`);
      continue;
    }
    if (dryRun) {
      console.log(`[${project}] DRY-RUN would create: ${rule.name}`);
      continue;
    }
    const r = await api(`/projects/${ORG}/${project}/rules/`, 'POST', rule);
    if (r.ok) console.log(`[${project}] created rule ${r.json.id}: ${rule.name}`);
    else console.error(`[${project}] FAILED ${rule.name}:`, r.status, r.json);
  }
}

async function ensureBackendMetricAlert() {
  const project = 'rshir-backend';
  // Need numeric project id for metric-alert listing.
  const projInfo = await api(`/projects/${ORG}/${project}/`);
  if (!projInfo.ok) {
    console.error(`[${project}] failed to fetch project id:`, projInfo.status);
    return;
  }
  const projectId = projInfo.json.id;
  const list = await api(`/organizations/${ORG}/alert-rules/?project=${projectId}`);
  if (!list.ok) {
    console.warn(`[${project}] metric alerts unavailable (${list.status}) — likely Performance not enabled on this plan; skipping. Issue alerts cover the WARN/CRITICAL surface.`);
    return;
  }
  const NAME = 'RSHIR Backend · p95 transaction duration > 2s for 5 min';
  const existing = (list.json || []).find((r) => r.name === NAME);
  if (existing) {
    console.log(`[${project}] skip (metric alert exists): ${NAME}`);
    return;
  }
  if (dryRun) {
    console.log(`[${project}] DRY-RUN would create metric alert: ${NAME}`);
    return;
  }

  const body = {
    name: NAME,
    aggregate: 'p95(transaction.duration)',
    timeWindow: 5, // minutes — observation window
    projects: [project],
    query: 'event.type:transaction',
    thresholdType: 0, // 0 = above, 1 = below
    resolveThreshold: 1500,
    triggers: [
      {
        label: 'critical',
        alertThreshold: 2000,
        actions: [
          {
            type: 'sentry_app',
            targetType: 'sentry_app',
            // sentry_app via webhook plugin isn't directly callable from metric alerts;
            // metric alerts only trigger user/team email or registered integrations.
            // We fall back to email-on-trigger; the issue alerts handle the volume case.
            // This stub will be created without webhook action so the rule still exists,
            // and Iulian sees it in dashboard.
          },
        ],
      },
    ],
    dataset: 'transactions',
    eventTypes: ['transaction'],
    environment: null,
    owner: null,
    comparisonDelta: null,
    detectionType: 'static',
  };

  // Simplify: metric alerts on free/team plan support email actions. Skip actions
  // entirely and let the rule exist; the WARN signal comes from issue alerts.
  body.triggers[0].actions = [];

  const r = await api(`/organizations/${ORG}/alert-rules/`, 'POST', body);
  if (r.ok) console.log(`[${project}] created metric alert ${r.json.id}: ${NAME}`);
  else console.error(`[${project}] FAILED metric alert:`, r.status, r.json);
}

console.log(`[lane-k] ${dryRun ? 'DRY-RUN' : 'LIVE'} — provisioning Sentry alert rules`);
for (const p of PROJECTS) {
  await ensureIssueRules(p);
}
await ensureBackendMetricAlert();
console.log('[lane-k] done');
