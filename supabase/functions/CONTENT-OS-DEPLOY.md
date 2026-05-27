# Content OS — One-time Deploy Runbook

Operator: Iulian. Run once when wiring Content OS for the first time in a
project. Re-running is safe (idempotent) for everything except the
`openssl rand -hex 32` — that mints a NEW token, which would invalidate
the previous deploy. Reuse the existing value if you already have one.

## Prereqs

- `supabase` CLI (>= v1.200)
- `vercel` CLI (logged in to the HIR org)
- `<PROJECT_REF>` from Supabase project URL (e.g. `bsxfvxwfvthqnvwsdkdf`)

## 1. Mint the shared cron token

```bash
# Generate ONCE — both Supabase secrets AND Vercel env vars use the same string.
TOKEN=$(openssl rand -hex 32)
echo "CONTENT_OS_CRON_TOKEN=$TOKEN"   # copy this somewhere safe (1Password)
```

## 2. Deploy the 5 Content OS Edge Functions

```bash
supabase login

supabase functions deploy content-whatsapp-webhook   --no-verify-jwt --project-ref <PROJECT_REF>
supabase functions deploy content-telegram-webhook   --no-verify-jwt --project-ref <PROJECT_REF>
supabase functions deploy content-os-generate        --no-verify-jwt --project-ref <PROJECT_REF>
supabase functions deploy content-os-publish-queue   --no-verify-jwt --project-ref <PROJECT_REF>
supabase functions deploy content-os-reflect         --no-verify-jwt --project-ref <PROJECT_REF>
```

The functions are intentionally non-JWT (called by pg_cron, not by user
sessions). Auth is via `CRON_SHARED_SECRET` + `CONTENT_OS_CRON_TOKEN`.

## 3. Configure Edge Function secrets

```bash
# CRON_SHARED_SECRET — Edge Function checks the incoming Authorization
# header ends with this value. Reuse the project-wide cron secret if you
# have one; otherwise mint another `openssl rand -hex 32`.
supabase secrets set CRON_SHARED_SECRET=<existing-or-new> --project-ref <PROJECT_REF>

# Where the Edge Function calls back into the Next.js admin app.
supabase secrets set CONTENT_OS_API_BASE=https://admin.hirforyou.ro --project-ref <PROJECT_REF>

# Token the Edge Function sends to /api/content/*-tick (Bearer). Same
# string the Next.js handlers expect via CONTENT_OS_CRON_TOKEN env var.
supabase secrets set CONTENT_OS_CRON_TOKEN=$TOKEN --project-ref <PROJECT_REF>
```

## 4. Configure pg_cron database settings

These two `ALTER DATABASE` statements expose the URL + token to pg_cron
so the migration `20260628_002_content_os_cron_schedule.sql` can read them
via `current_setting(...)`. Run them ONCE in the Supabase SQL editor:

```sql
alter database postgres set "app.content_os_tick_url"
  = 'https://<PROJECT_REF>.functions.supabase.co';

alter database postgres set "app.content_os_cron_token"
  = '<TOKEN — same value as the Edge Function secret>';
```

After running both, reconnect any open `psql` sessions so the new
`current_setting` values take effect.

## 5. Apply the migration

The schema + cron schedule migrations land via your normal CI / db push:

```bash
supabase db push --project-ref <PROJECT_REF>
```

If the cron migration printed `NOTICE: Content OS pg_cron will be created
but inactive` it means step 4 was skipped — re-run step 4 then either
`alter system reload` or unschedule + reschedule via:

```sql
select cron.unschedule('content-os-generate');
select cron.unschedule('content-os-publish-queue');
select cron.unschedule('content-os-reflect');
-- then re-run the relevant cron.schedule(...) blocks from the migration.
```

## 6. Add the cron token to Vercel

```bash
# `production` env so the route handlers can authorize the Bearer token.
vercel env add CONTENT_OS_CRON_TOKEN production
# (paste $TOKEN from step 1)

# Redeploy admin app so the env var is picked up.
vercel --prod
```

## 7. Smoke test

```bash
# Direct hit on the Next.js admin app — should return 200 + ok:true.
curl -sS -X POST -H "Authorization: Bearer $TOKEN" \
  https://admin.hirforyou.ro/api/content/generate-tick

# Indirect via Edge Function — should return whatever the admin returned.
curl -sS -X POST \
  -H "Authorization: Bearer $CRON_SHARED_SECRET" \
  https://<PROJECT_REF>.functions.supabase.co/content-os-generate
```

Expected JSON shape:
```json
{ "ok": true, "stats": { "processed": 0, "succeeded": 0, "failed": 0, "capped": 0, "notified": 0 }, "timestamp": "2026-..." }
```

`processed: 0` is fine on first run — no active brands yet.

## 8. Verify pg_cron scheduling

```sql
select jobname, schedule, active from cron.job
 where jobname like 'content-os-%' order by jobname;
```

Expected:
```
 jobname                    | schedule    | active
----------------------------+-------------+--------
 content-os-generate        | 0 6 * * *   | t
 content-os-publish-queue   | 0 * * * *   | t
 content-os-reflect         | 0 22 * * *  | t
```

After the next cron tick:
```sql
select jobid, runid, job_pid, database, username, command, status, return_message, start_time, end_time
  from cron.job_run_details
 where jobid in (select jobid from cron.job where jobname like 'content-os-%')
 order by start_time desc limit 10;
```

`status='succeeded'` on each row means the chain is healthy.

## Provider API keys (Standard plan)

Optional but unlocks real video generation. Without these, VideoGenAgent
falls back to the mock provider (returns a stub URL — drafts still publish).

```bash
# Pika 2.5 (basic tier default)
vercel env add PIKA_API_KEY production

# Runway Gen-3 (pro + enterprise tier default)
vercel env add RUNWAY_API_KEY production

# Anthropic — already set if Hepi works. Re-check via:
vercel env ls | grep ANTHROPIC_API_KEY
```

## Rollback

```sql
select cron.unschedule('content-os-generate');
select cron.unschedule('content-os-publish-queue');
select cron.unschedule('content-os-reflect');
```

Vercel: `vercel env rm CONTENT_OS_CRON_TOKEN production` (drains auth so
the route handlers 401 on any future cron pings).
