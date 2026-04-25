-- One-off seed for the vault rows the pg_cron jobs decrypt at runtime.
-- Idempotent via NOT EXISTS guards. Apply via supabase/apply-sql.mjs.
-- Operator must already have set HIR_NOTIFY_SECRET in supabase secrets;
-- the corresponding `notify_new_order_secret` vault row is seeded by the
-- existing notify-new-order setup (RSHIR-22 / supabase/README.md).

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'daily_digest_url') then
    perform vault.create_secret(
      'https://qfmeojeipncuxeltnvab.functions.supabase.co/daily-digest',
      'daily_digest_url',
      'daily-digest Edge Function URL'
    );
  end if;

  if not exists (select 1 from vault.secrets where name = 'review_reminder_url') then
    perform vault.create_secret(
      'https://qfmeojeipncuxeltnvab.functions.supabase.co/review-reminder',
      'review_reminder_url',
      'review-reminder Edge Function URL'
    );
  end if;
end $$;
