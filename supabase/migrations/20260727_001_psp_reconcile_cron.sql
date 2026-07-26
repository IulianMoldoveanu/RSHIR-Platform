-- PSP payment reconciliation cron. Root cause: confirmed empirically
-- 2026-07-27 that Netopia's sandbox IPN webhook is not reliably delivered —
-- a real payment came back "Approved" (error.code 00) when queried directly
-- via /operation/status, but never triggered our /api/webhooks/netopia
-- notifyUrl (0 rows in psp_webhook_events for that payment). Rather than
-- depend exclusively on the webhook, this polls
-- /api/cron/reconcile-payments every 2 minutes, which actively queries
-- Netopia for any payment stuck PENDING for 3+ minutes and applies the same
-- side effects the webhook would have (mark PAID + dispatch, or FAILED).
--
-- Uses vault secret psp_reconcile_secret (already created + set as
-- PSP_RECONCILE_SECRET on Vercel) in the x-cron-secret header — same
-- pattern as weather_cron_token / events_cron_token.

-- Any valid hostname on the restaurant-web Vercel deployment reaches the
-- same route/code — the endpoint itself queries ALL tenants' pending
-- Netopia payments directly from the DB, not scoped by request hostname.
select cron.schedule(
  'psp-reconcile-payments',
  '*/2 * * * *',
  $$
    select net.http_post(
      url := 'https://foisorul-a.hirforyou.ro/api/cron/reconcile-payments',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                          where name = 'psp_reconcile_secret' limit 1)
      ),
      body := '{}'::jsonb
    );
  $$
);
