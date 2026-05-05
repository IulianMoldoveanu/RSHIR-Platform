# Sentry alert rules — RSHIR

Authoritative list of every Sentry issue-alert rule installed across the 5 RSHIR
projects, what it triggers on, and where the notification ends up.

Region: **EU (`de.sentry.io`)** · Org slug: **`hirbuild-your-dreams`** · Region domain
in dashboard: `https://hirbuild-your-dreams.sentry.io`.

## Architecture

```
Sentry issue alert  ──▶  webhooks plugin (per project)
                              │
                              ▼
       https://qfmeojeipncuxeltnvab.supabase.co
       /functions/v1/sentry-webhook-intake?token=<SENTRY_WEBHOOK_SECRET>
                              │
                              ▼
              Edge Function: sentry-webhook-intake
                  ├─ HMAC OR query-token auth
                  ├─ classify severity (INFO / WARN / CRITICAL)
                  ├─ insert into public.sentry_events (deduped)
                  └─ Telegram → Hepi bot (only for WARN + CRITICAL)
```

The Edge Function — not Sentry rules — decides what wakes Iulian:

- `level=fatal` → CRITICAL (Telegram)
- `level=error` → CRITICAL (Telegram)
- `level=warning` → WARN (Telegram)
- `level=info|debug` → INFO (DB only)
- Title matches an ignore-pattern (`AbortError`, `Failed to fetch`, `ResizeObserver loop`, …)
  → INFO regardless of level

Persistence table: `public.sentry_events` (migration `20260504_003_sentry_events.sql`).
RLS deny-all for authenticated; service role only.

## Projects + DSNs

| Slug | Platform | Sentry project ID |
| --- | --- | --- |
| `rshir-customer` | javascript-nextjs | 4511321500418128 |
| `rshir-vendor`   | javascript-nextjs | 4511321500549200 |
| `rshir-courier`  | javascript-nextjs | 4511321500680272 |
| `rshir-admin`    | javascript-nextjs | 4511321500811344 |
| `rshir-backend`  | node-express      | 4511321500876880 |

DSNs in `~/.hir/secrets.json` under `sentry.projects`.

## Rules

All rules live on **every project unless otherwise noted**, all use the
`webhooks` plugin action which posts to `sentry-webhook-intake`.

### Pre-existing (Lane K, 2026-05-04)

| Name | Trigger | Frequency cap | Notes |
| --- | --- | --- | --- |
| RSHIR · First seen issue (regression detect) | New issue OR regression OR escalation, with `message` not containing `AbortError` | 5 min/issue | Catches genuine regressions |
| RSHIR · Volume burst (≥25 events / 5 min) | `EventFrequency` count ≥25 in 5 min | 30 min/issue | Spike detector |
| RSHIR · High volume (≥100 events / 1 hour) [low-priority] | `EventFrequency` count ≥100 in 1 h | 60 min/issue | Slow-burn detector |
| Send a notification for high priority issues | Default Sentry rule, email | n/a | Inherited; harmless |

### Added by Lane SENTRY-ALERTS (2026-05-05)

| Name | Trigger | Filter | Frequency cap | Applies to |
| --- | --- | --- | --- | --- |
| RSHIR · Fatal-level issue (any occurrence) | New / regressed / escalated issue | `level == fatal` | 5 min/issue | All 5 |
| RSHIR · Payment failure tag | New / regressed / escalated issue | tag `payment_failure == true` | 5 min/issue | All 5 |
| RSHIR · Stripe or webhook keyword in title | New / regressed / escalated issue | message contains `Stripe` OR contains `webhook` (filterMatch=any) | 5 min/issue | All 5 |
| RSHIR · Backend error volume (≥5 / 5 min) | `EventFrequency` count ≥5 in 5 min | `level >= error` | 30 min/issue | `rshir-backend` only |

The 5/5min volume-burst rule is **backend-only** because the UI projects (customer / vendor /
courier / admin) report end-user device noise (Safari fetch drops, transient
network failures, AbortError on tab navigation) that easily exceed 5 events / 5
min without indicating a real outage. Backend, by contrast, runs on a single
Vercel serverless population — 5 errors / 5 min there reliably means something
is broken.

## Routing

All rules above end up at the same Edge Function. Telegram dispatch is decided
**by the Edge Function** (severity classifier), not by the rule. This keeps rule
configuration uniform and lets us tune Telegram noise in one place.

- Telegram bot: **Hepi** (handle `@MasterHIRbot`), token in `~/.hir/secrets.json`
  → `telegram.bot_api_token`.
- Chat target: `telegram.iulian_chat_id`.
- Edge Function env vars (set in Supabase project secrets):
  `SENTRY_WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_IULIAN_CHAT_ID`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## How to add or change a rule

1. Edit `scripts/post-merge/setup-sentry-alerts.mjs` — add a new entry to the
   `RULES` array. Names must be **unique** across the project (the script's
   idempotency key is the rule name).
2. Run `node scripts/post-merge/setup-sentry-alerts.mjs --dry-run` to preview.
3. Run without `--dry-run` to install. Re-running is safe (skips existing).
4. Update this doc.

To **remove** a rule, delete it manually in the Sentry UI; the script never
deletes (safer when humans have edited rules out-of-band).

## How to test the routing end-to-end

In any RSHIR app, instrument a temporary throw:

```ts
Sentry.captureMessage('PAYMENT_FAILURE_TEST', {
  level: 'fatal',
  tags: { payment_failure: 'true' },
});
```

You should see:

1. Within ~30 s, an event in the project's Issues tab.
2. A row in `public.sentry_events` with `severity='CRITICAL'` and
   `notified_telegram=true`.
3. A Telegram message from Hepi to `iulian_chat_id`.

For dry-run testing without waking Iulian, append `&dry_run=1` to the webhook
URL in the Sentry project's `webhooks` plugin (DB row still inserts, Telegram
skipped).

## Related

- Migration: `supabase/migrations/20260504_003_sentry_events.sql`
- Edge Function: `supabase/functions/sentry-webhook-intake/index.ts`
- Setup script: `scripts/post-merge/setup-sentry-alerts.mjs`
- Vault: `~/.hir/secrets.json` keys `sentry.*`, `supabase.sentry_webhook_secret`,
  `telegram.bot_api_token`, `telegram.iulian_chat_id`
