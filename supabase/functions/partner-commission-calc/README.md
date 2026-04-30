# partner-commission-calc

Monthly Edge Function that computes partner referral commissions and
upserts rows into `public.partner_commissions`. Triggered by pg_cron;
also callable manually for backfills and dry-runs.

## What it does

For each ACTIVE `partner_referral`:

1. Counts the tenant's `restaurant_orders` rows where
   `status='DELIVERED' AND payment_status='PAID' AND created_at` falls
   inside the target Bucharest-local calendar month.
2. Computes `commission_amount = order_count * 3.00 RON * commission_pct`
   (Tier 1 pricing — see TODO in the source for Tier 2 follow-up).
3. Upserts into `partner_commissions` with status `PENDING` and a
   unique key on `(referral_id, period_start, period_end)`.
4. Skips upserts when an existing row is already `PAID` (logs a
   warning).

The default period is the **previous calendar month** in Bucharest
local time. Pass `?period=YYYY-MM` to backfill an arbitrary month.

## Deploy

```sh
pnpm node supabase/deploy-function.mjs partner-commission-calc
```

## Required secrets

| Secret name                  | Source                  | Notes                                                                  |
| ---------------------------- | ----------------------- | ---------------------------------------------------------------------- |
| `HIR_NOTIFY_SECRET`          | function secret         | Shared HMAC secret reused across every HIR notify-style function.      |
| `SUPABASE_URL`               | auto-injected           | -                                                                      |
| `SUPABASE_SERVICE_ROLE_KEY`  | auto-injected           | Bypasses RLS — required to read `partner_referrals` and write rows.    |

Vault entries (one-time, run as service-role SQL):

```sql
select vault.create_secret(
  'https://qfmeojeipncuxeltnvab.functions.supabase.co/partner-commission-calc',
  'partner_commission_calc_url',
  'partner-commission-calc Edge Function URL');
```

The matching `notify_new_order_secret` vault row is reused (same value
as `HIR_NOTIFY_SECRET`).

## Manual trigger

Backfill April 2026:

```sh
curl -X POST \
  "https://qfmeojeipncuxeltnvab.supabase.co/functions/v1/partner-commission-calc?period=2026-04" \
  -H "x-hir-notify-secret: $HIR_NOTIFY_SECRET"
```

Dry-run (compute only, no writes):

```sh
curl -X POST \
  "https://qfmeojeipncuxeltnvab.supabase.co/functions/v1/partner-commission-calc?period=2026-04&dry_run=true" \
  -H "x-hir-notify-secret: $HIR_NOTIFY_SECRET"
```

Trigger for the previous month (cron-equivalent):

```sh
curl -X POST \
  "https://qfmeojeipncuxeltnvab.supabase.co/functions/v1/partner-commission-calc" \
  -H "x-hir-notify-secret: $HIR_NOTIFY_SECRET"
```

Response shape:

```json
{
  "ok": true,
  "period": "2026-04",
  "dry_run": false,
  "referrals_processed": 12,
  "commissions_inserted": 11,
  "commissions_skipped_paid": 0,
  "commissions_failed": 1,
  "total_amount_cents": 78600
}
```

## Cron schedule

Registered by `supabase/migrations/20260601_001_partner_commission_cron.sql`.

- Job name: `partner-commission-monthly`
- Cron expression: `0 1 2 * *` (UTC)
- Effective time: 01:00 UTC on day 2 of each month, which is 03:00
  Europe/Bucharest in winter (UTC+2) and 04:00 in summer DST (UTC+3).
- Migration is idempotent — `cron.unschedule` + `cron.schedule` on
  every apply.

## Idempotency & failure mode

- Re-running the function for the same period upserts the same
  `(referral_id, period_start, period_end)` row — no duplicates.
- Rows already in status=PAID are NEVER overwritten.
- Per-referral failures are logged and counted in
  `commissions_failed`; they do not abort the rest of the run.
