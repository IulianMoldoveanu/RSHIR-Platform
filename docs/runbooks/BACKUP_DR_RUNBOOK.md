# Backup & Disaster Recovery Runbook

**Owner:** AI Chief of Staff + Iulian Moldoveanu
**First written:** 2026-05-08 (Lane BACKUP-DR-AUDIT)
**Re-verify cadence:** monthly minimum, plus before any "national scale"
push (e.g. >30 active tenants, BG/HU launch, marketing burst).

This runbook is the single source of truth for "what happens if something
goes wrong with the data". It is intentionally written so a non-author can
execute every recovery step without prior context.

---

## TL;DR — current state (2026-05-08)

| Surface | State | Severity if lost |
|---|---|---|
| Supabase Postgres (production DB) | **Free tier**, 7-day daily backups, **PITR disabled**, no manual snapshot tooling in place | P0 — total business loss |
| Supabase Storage buckets (7) | No automated off-site backup | P1 — media loss, recoverable from upstream when GloriaFood imports / re-uploads |
| Vault secrets table (`hir_*_vault_secret` RPC) | Inside same DB → covered by DB backup | P1 — locks tenants out of payments / ANAF |
| Vercel deployments (4 projects) | 30-day rollback window, code mirror in GitHub | P3 — fully recoverable |
| GitHub repository | Multi-mirror (origin + every dev clone + Vercel internal) | P3 — fully recoverable |
| Edge Functions | Source-of-truth in `supabase/functions/`, deployed via `scripts/deploy-fn-with-shared.mjs` | P3 — fully recoverable |
| pg_cron schedules | Defined in versioned migrations | P2 — re-applying migrations re-creates schedules |
| Tenant data export (GDPR / portability) | **Per-surface CSV only**, no full-tenant ZIP archive | P2 — Article 20 GDPR risk at scale |
| Mass-delete protection on `tenants` | **Now enforced** via `tenants_prevent_unguarded_delete()` trigger (this lane) | P0 → P3 after 2026-05-08 |

**Iulian morning action list:** see [§9](#9-iulian-morning-action-list).

---

## 1. Database backups

### 1.1 What Supabase gives us today

Verified via Mgmt API on 2026-05-08:

```
GET https://api.supabase.com/v1/projects/qfmeojeipncuxeltnvab/database/backups
→ {"region":"eu-central-1","pitr_enabled":false,"walg_enabled":true,"backups":[],"physical_backup_data":{}}
```

```
GET https://api.supabase.com/v1/organizations/zhzvlbpsbpyyfaywhwjg
→ {"plan":"free", ...}
```

What this means in plain Romanian:

- **Org plan = free.** Free tier does daily logical backups with **7-day retention**, but the snapshots are **NOT downloadable via API** — they are retained internally for restore-only by Supabase support.
- **PITR disabled.** Recovery granularity is "yesterday's backup", not "5 min before the bad query".
- **No physical backup data exposed.** We cannot pull a `.dump` to off-site storage on the free tier.

### 1.2 Gap

For a national-scale launch (30+ tenants, GMV in the tens of thousands of
RON per day) the worst-case data loss window is **24 hours**, with **zero
PITR**, and **zero off-site copy under our control**. A single bad migration
or a malicious INSERT/UPDATE/DELETE has no fast rollback.

### 1.3 Required posture before scale

| Trigger | Action |
|---|---|
| 10+ active tenants OR first paid GMV month | Upgrade Supabase **Pro** ($25/mo) — unlocks daily backups with 7-day download + read-replica add-on availability |
| 30+ active tenants OR BG/HU launch | Add **PITR** addon (~$100/mo) — unlocks point-in-time recovery to any second within 7 days |
| 50+ active tenants | Add **Read replica** addon (~$25-50/mo) for fast restore + reporting offload |
| Any time | Set up nightly `pg_dump --schema-only + --data-only` to encrypted S3 (cheap, ~$1/mo storage) — see §1.5 |

### 1.4 Daily verification

The Edge Function `backup-verify-daily` (shipped this lane) pings the
Supabase Mgmt API once per day and alerts Iulian via Telegram if:

- The org plan is `free` AND no backup row is reachable via the API
  (fully expected today, intentional alert until upgrade to Pro).
- The org plan is `pro` or higher AND the most recent backup is **older
  than 26 hours**.

The check is logged to `function_runs` for observability. Failure modes
(API quota, transient 5xx) are differentiated from "genuinely stale" so
we don't get false positives.

### 1.5 Off-site backup procedure (deferred — Pro upgrade prerequisite)

Once on Pro, the recommended off-site setup:

1. Create an S3 bucket `hir-db-offsite-backups` in `eu-central-1` (Frankfurt — same region for low transfer cost).
2. IAM user with `s3:PutObject` only on that bucket. Encrypt at rest with SSE-S3.
3. GitHub Actions workflow (`.github/workflows/db-offsite-backup.yml`) running daily at 04:00 UTC:
   - `pg_dump $DATABASE_URL > /tmp/backup.sql.gz`
   - `aws s3 cp /tmp/backup.sql.gz s3://hir-db-offsite-backups/$(date +%Y-%m-%d).sql.gz`
   - Lifecycle policy: keep daily for 30 days, weekly for 90 days, monthly for 1 year.
4. Verify via runbook §2.3 monthly.

This is **not yet built** — gated on Pro upgrade so we can use the
direct DB connection string without exhausting the free-tier connection
pool during the long `pg_dump`.

---

## 2. Recovery procedures — top 5 incidents

### 2.1 Incident: bad migration corrupted production data

**Symptoms:** Sentry errors spike, `restaurant_orders` rows missing, tenants report "comenzile au dispărut".

**Recovery (current free-tier capability):**

1. **STOP** all writes immediately. Pause Vercel deployments:
   - `curl -X PATCH -H "Authorization: Bearer $VERCEL_TOKEN" "https://api.vercel.com/v9/projects/$PROJECT_ID/pause"` (one per project)
   - Or, via dashboard: Project → Settings → Pause Deployments.
2. Open ticket with Supabase support: <support@supabase.com> + emergency Discord. Subject: "URGENT: production data restore request for project qfmeojeipncuxeltnvab".
3. Specify the timestamp **before** the bad migration applied (read from `git log` on `supabase/migrations/`).
4. Free-tier SLA: best-effort, typically 24-72h. Pro plan: ~4h business hours.
5. While waiting, communicate to tenants via Telegram + status page (`/status` on hir-restaurant-web).

**Recovery (post-Pro + PITR):**

1. Same steps 1 + 5.
2. From Supabase dashboard: Database → Backups → Restore → pick timestamp.
3. Restore to a **new project** (recommended), then promote via DNS or env var swap. NEVER restore in-place on a live customer-facing project.
4. Re-run any data writes that happened between the restore point and the incident discovery — we keep `audit_log` table specifically for this replay path.

### 2.2 Incident: Supabase project goes down (region outage)

**Symptoms:** All apps return 5xx. `db.qfmeojeipncuxeltnvab.supabase.co` unreachable.

**Recovery:**

1. Check <status.supabase.com> for `eu-central-1` outage.
2. Communicate to tenants via Telegram. Status page is hosted on Vercel (separate region) so it stays up.
3. There is no failover today. Free tier = single region single AZ.
4. Once Supabase recovers, run [§5 smoke procedure](#5-post-incident-smoke-procedure).
5. Post-incident: write incident report at `Desktop/HIR-Status-Reports/RSHIR/incidents/YYYY-MM-DD-supabase-outage.md`.

**Future hardening (after 50+ tenants):** evaluate Supabase multi-region read replicas + a write-failover pattern. Not now — premature optimization.

### 2.3 Incident: tenant accidentally bulk-deletes their own menu

**Symptoms:** OWNER reports "tot meniul a dispărut", `restaurant_menu_items` empty for one `tenant_id`.

**Recovery (today):**

1. Identify the tenant_id and the time of the bulk delete (`audit_log` table has the row).
2. Open ticket with Supabase support requesting partial restore of `restaurant_menu_items` for that `tenant_id` from yesterday's backup.
3. Free-tier SLA: 24-72h. During wait: ask tenant to re-import from CSV / GloriaFood / SmartBill / their backup PDF menu.
4. Once partial dump arrives: insert into a staging table, validate, then `INSERT ... ON CONFLICT DO NOTHING` into the live table.

**Recovery (post-PITR):**

1. Run a `pg_dump --table=restaurant_menu_items --where="tenant_id='...'"` against a fresh PITR-restored project at a timestamp before the delete.
2. Pipe into staging table, validate, merge.

**Long-term mitigation:** add a soft-delete pattern (`deleted_at` column) on `restaurant_menu_items` + admin UI "trash bin" that surfaces deleted items for 30 days. Tracked separately, not in this lane.

### 2.4 Incident: vault secret rotated/lost (Stripe / Netopia / SmartBill)

**Symptoms:** payment webhooks failing 401 / 403, ANAF e-Factura push fails.

**Recovery:**

1. Identify which secret via Sentry / `function_runs` ERROR text.
2. Iulian re-issues the secret from the upstream provider dashboard (Stripe, Netopia, SmartBill, ANAF).
3. Update via the OWNER UI on the affected tenant's Settings page (vault writes go through `hir_*_vault_secret` SECURITY DEFINER RPCs — never raw INSERT). For platform-level secrets, use Supabase secrets API:
   - `curl -X POST -H "Authorization: Bearer $SUPABASE_MGMT_PAT" -H "Content-Type: application/json" -d '[{"name":"X","value":"Y"}]' "https://api.supabase.com/v1/projects/qfmeojeipncuxeltnvab/secrets"`
4. Trigger a re-deploy of any Edge Function that reads the secret at boot:
   - `node scripts/deploy-fn-with-shared.mjs <function-name>`

### 2.5 Incident: a Vercel deployment ships a bug, must rollback fast

**Symptoms:** new commit on main breaks customer flow.

**Recovery (≤2 min):**

1. Vercel dashboard → Project → Deployments → find the last-known-good production deploy → "Promote to Production".
2. Or via API: `curl -X POST -H "Authorization: Bearer $VERCEL_TOKEN" "https://api.vercel.com/v13/deployments/$GOOD_DEPLOYMENT_ID/promote"`
3. Communicate "deploy revertit, investigăm" to Iulian via Telegram.
4. Open hot-fix branch from that good SHA: `git checkout -b fix/rollback-<topic> <good-sha>`.

Vercel deployment history retains 30 days of immutable builds. We rarely need DB rollback for code-only bugs.

---

## 3. Storage buckets

### 3.1 Inventory (verified 2026-05-08)

| Bucket | Public | Size limit | Purpose | Loss impact |
|---|---|---|---|---|
| `menu-images` | yes | 5 MB | Product photos | P2 — re-uploadable from tenant phone |
| `menu-imports` | no | 8 MB | GloriaFood CSV / PDF menu imports | P3 — transient |
| `tenant-branding` | yes | 4 MB | Logo + cover | P2 — re-uploadable |
| `tenant-feedback-screenshots` | no | unlimited | Feedback Loop intake | P3 — diagnostic only |
| `courier-avatars` | yes | 2 MB | Courier profile photos | P3 |
| `courier-proofs` | no | 6 MB | Proof-of-delivery photos | P1 — legal evidence for disputes |
| `aggregator-emails` | no | unlimited | Parsed aggregator email payloads | P2 — fiscal reconciliation |

### 3.2 Backup state

Supabase Storage on free tier has **no native backup**. Storage objects
live in S3-compatible storage and are NOT included in the daily DB backup.

### 3.3 Required posture

For Pro plan: enable Storage backup via S3 cross-region replication
(set in bucket policy). Cost: ~$0.10/GB/month at current scale (~5 GB =
$0.50/mo).

For now, the highest-loss bucket is `courier-proofs` (legal evidence).
Recommended interim: a weekly cron that lists `courier-proofs` and pushes
a signed manifest (filenames + sha256) to GitHub releases as an integrity
witness. Not yet built — backlog.

---

## 4. Code + infra recoverability

### 4.1 GitHub

- Repo `IulianMoldoveanu/RSHIR-Platform` is the single source of truth.
- Multiple mirrors exist as a side effect:
  - Origin (GitHub).
  - Every dev clone (Iulian + AI Chief workstations).
  - Every Vercel project's internal git mirror (separately replicated by Vercel).
- Recovery: clone fresh from origin, push to a new origin if the existing one is compromised.

### 4.2 Vercel

- 4 production projects (web, admin, courier, admin-panel).
- 30-day immutable deployment history per project.
- Env vars manually set per project — backed up in `C:\Users\Office HIR CEO\.hir\secrets.json`.
- Recovery: re-link git, re-set env vars, push.

### 4.3 Edge Functions

- Source of truth: `supabase/functions/` in the repo.
- Deploy via `scripts/deploy-fn-with-shared.mjs <function-name>` (handles `_shared/` bundling per the migration-drift lesson).
- Recovery: re-run deploy script. State (config, secrets) re-applied via Supabase secrets API or migrations.

### 4.4 pg_cron schedules

- All 16 scheduled jobs are defined in versioned migrations under `supabase/migrations/`.
- Recovery: re-apply migrations (idempotent — they all use `IF NOT EXISTS` / `cron.schedule(...)` which is upsert-safe in Supabase).
- Verify after recovery: `SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;`

---

## 5. Post-incident smoke procedure

After any DB restore or deployment rollback, run this 5-minute checklist:

1. **Apps respond:**
   - `curl https://hir-restaurant-web.vercel.app/api/healthz` → `{"ok":true,...}`
   - `curl https://hir-restaurant-admin.vercel.app/api/healthz` → `{"ok":true,...}`
   - `curl https://courier-beta-seven.vercel.app/api/healthz` → `{"ok":true,...}`
2. **Demo tenant storefront renders:**
   - <https://hir-restaurant-web.vercel.app/foisorul-a> returns 200 + has menu.
3. **GloriaFood import endpoint:**
   - GET <https://hir-restaurant-admin.vercel.app/migrate-from-gloriafood> returns 200.
4. **One real order round-trip on demo:**
   - Place order on the demo storefront → verify it appears in `/dashboard/orders` for the demo OWNER.
5. **Cron health:**
   - SQL: `SELECT jobname, last_run_status FROM cron.job_run_details ORDER BY end_time DESC LIMIT 20;`
   - Anything ERROR in the last 24h → triage.
6. **`function_runs` last 24h:**
   - SQL: `SELECT function_name, count(*) FILTER (WHERE status='ERROR') AS err FROM function_runs WHERE started_at > now() - interval '24h' GROUP BY 1 ORDER BY err DESC;`
   - Anything new failing post-incident → triage.

---

## 6. Tenant data export (GDPR Article 20 — portability)

### 6.1 Current state

- Per-surface CSV exports exist:
  - `/dashboard/orders/export` — orders CSV
  - `/dashboard/customers/export` — customers CSV
  - `/dashboard/settings/exports` — fiscal sales register (SmartBill / SAGA)
  - Menu export — N/A (tenant authors menu, owns the source data)
- **No full-tenant ZIP archive.** A tenant offboarding today would have to
  click 4-5 separate exports to leave with their full data.

### 6.2 Gap

GDPR Article 20 obliges us to provide a "structured, commonly used and
machine-readable" portable format on demand. Per-CSV is acceptable but
brittle. A single-click ZIP is operationally cleaner.

### 6.3 Recommended posture

Build `/dashboard/settings/data-export/full-archive.zip` action that:

1. OWNER-gated, audit-logged, rate-limited (1/24h).
2. Streams a ZIP with: `orders.csv`, `customers.csv`, `menu.json`, `reservations.csv`, `reviews.csv`, `settings.json`.
3. Includes a manifest file with schema version + export timestamp.

**Status:** scoped, NOT in this lane. Blocked on streaming-ZIP library
choice (current repo has no `archiver` / `JSZip` dependency — adding it
is a P1 follow-up, not P0). Track in `Desktop/HIR-Status-Reports/RSHIR/`
backlog.

---

## 7. Mass-delete protection — applied this lane

### 7.1 Migration `20260508_002_tenants_mass_delete_guard.sql`

A `BEFORE DELETE FOR EACH ROW` trigger on `public.tenants` blocks any
delete unless the calling session has explicitly opted in:

```sql
SET LOCAL hir.allow_tenant_delete = 'true';
DELETE FROM public.tenants WHERE id = '...';
```

Without that flag, `DELETE FROM tenants` (including service-role calls
from a leaked key, a typo in psql, or a bad migration) raises:

```
ERROR: tenant delete blocked — set hir.allow_tenant_delete=true within
the same transaction to override (intentional + audited)
```

### 7.2 Rationale

Two business paths today hard-delete a tenant — both are rollback
branches in `/api/signup` and `/dashboard/admin/onboard` that fire only
when `tenant_members` INSERT fails seconds after a successful tenant
INSERT (i.e. cleaning up a tenant that has zero child data). This lane
migrates both call sites to use the sanctioned RPC
`hir_delete_tenant_rollback(p_tenant_id)` which performs the
`SET LOCAL hir.allow_tenant_delete=true` inside its SECURITY DEFINER
body. Beyond those two paths, no production flow hard-deletes a tenant
— we use `status='SUSPENDED'`.

The trigger therefore changes behavior **only** on accidental, manual,
or malicious paths, not on any production flow.

### 7.3 If you legitimately need to delete a tenant

```sql
BEGIN;
SET LOCAL hir.allow_tenant_delete = 'true';
DELETE FROM public.tenants WHERE id = '<uuid>' AND status = 'SUSPENDED';
-- verify cascade row counts via RAISE NOTICE if desired
COMMIT;
```

The `SET LOCAL` is per-transaction only — it cannot leak to other
sessions or other queries.

---

## 8. Credentials inventory

Single-master vault: `C:\Users\Office HIR CEO\.hir\secrets.json` on
Iulian's workstation. Backed up: NO (intentional — sensitive). Iulian
keeps a printed copy of the most-critical tokens (Supabase Mgmt PAT,
Vercel PAT, GitHub PAT) in a sealed envelope in his physical safe.

| Credential | Where stored | Who has access |
|---|---|---|
| Supabase Mgmt PAT | vault + Supabase dashboard | Iulian (regen via dashboard) |
| Supabase service_role key | vault + Vercel env vars | Iulian + AI Chief sessions |
| Vercel API token | vault | Iulian |
| GitHub classic PAT | vault | Iulian |
| Stripe live restricted key | vault + Stripe dashboard | Iulian |
| Netopia / Viva keys (when issued) | vault + provider dashboards | Iulian |
| SmartBill API token | per-tenant vault rows in DB (encrypted via `pgsodium`) | OWNER of tenant |
| Telegram bot token | vault | Iulian |
| Anthropic API key | vault | Iulian |

### 8.1 Rotation cadence

- GitHub classic PAT: every 90 days (manual recreate).
- Supabase Mgmt PAT: every 180 days OR after any suspected leak.
- Vercel + Anthropic + Stripe + Telegram: every 365 days OR on leak.
- Per-tenant vault entries: rotate when the tenant requests; otherwise leave alone.

After any rotation, update `vault.json` AND any consumers (Vercel env,
Supabase function secrets, GitHub Actions secrets).

---

## 9. Iulian morning action list (2026-05-08)

In priority order:

1. **(2 min)** Verify current Supabase plan & decide on upgrade timeline.
   - <https://supabase.com/dashboard/project/qfmeojeipncuxeltnvab/settings/billing>
   - Recommendation: upgrade to **Pro ($25/mo) before first 10 paying tenants**. Add **PITR ($100/mo) before BG/HU launch**.
2. **(5 min)** Set Edge Function secret so `backup-verify-daily` can call the Mgmt API:
   ```
   curl -X POST -H "Authorization: Bearer $SUPABASE_MGMT_PAT" \
     -H "Content-Type: application/json" \
     -d '[{"name":"SUPABASE_MGMT_PAT","value":"sbp_e142..."}]' \
     "https://api.supabase.com/v1/projects/qfmeojeipncuxeltnvab/secrets"
   ```
   The function is shipped default-on, but without this secret it logs a
   single SUCCESS row + emits a one-time Telegram "secret missing" alert,
   then becomes a no-op. Setting the secret enables daily verification.
3. **(2 min)** Apply the new migration `20260508_002_tenants_mass_delete_guard.sql`.
   - From `scripts/post-merge/run-all-pending.mjs` or via Supabase SQL editor.
4. **(optional, when on Pro)** Schedule the off-site `pg_dump` GitHub Action per §1.5.
5. **(monthly)** Re-run this runbook's smoke procedure (§5) and update the
   "verified at" timestamp at the top of this file.

---

## 10. Test cadence

| Procedure | Cadence | Last run |
|---|---|---|
| Full runbook re-read | monthly | 2026-05-08 |
| Synthetic restore drill (restore yesterday's backup to sandbox project) | quarterly, before launch milestone | NEVER (gated on Pro upgrade) |
| Dry-run rollback on Vercel staging | every 2 weeks | NEVER — schedule next session |
| Mass-delete trigger smoke (try delete without flag, expect error) | once after migration applies | 2026-05-08 (pending apply) |
| Vault secret rotation drill (rotate Telegram bot in dev, verify alert path) | yearly | NEVER |

---

## Appendix A — Supabase Mgmt API reference

```
# List backups
GET https://api.supabase.com/v1/projects/{ref}/database/backups
Authorization: Bearer $SUPABASE_MGMT_PAT

# Set Edge Function secret
POST https://api.supabase.com/v1/projects/{ref}/secrets
Authorization: Bearer $SUPABASE_MGMT_PAT
[{"name":"FOO","value":"bar"}]

# Project metadata
GET https://api.supabase.com/v1/projects/{ref}
Authorization: Bearer $SUPABASE_MGMT_PAT

# Org plan
GET https://api.supabase.com/v1/organizations/{org_id}
Authorization: Bearer $SUPABASE_MGMT_PAT
```

## Appendix B — references

- `supabase/migrations/20260425_000_initial.sql` — tenants schema + cascading FKs.
- `supabase/migrations/20260428_700_gdpr_redaction.sql` — GDPR redaction RPC.
- `supabase/migrations/20260506_003_function_runs_observability.sql` — observability ledger.
- `supabase/functions/_shared/log.ts` — `withRunLog` helper used by `backup-verify-daily`.
- `scripts/deploy-fn-with-shared.mjs` — Edge Function deploy script with `_shared/` bundling.
- Memory: `lesson_migration_drift.md` — verify migration applied via Mgmt API after every merge.
