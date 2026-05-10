-- HIR Restaurant Suite — PSP provider CHECK constraint widening
-- Lane PSP-MULTIGATES-V1, 2026-05-10.
--
-- Widens the `provider` CHECK constraint on psp_credentials, psp_payments
-- and psp_webhook_events from {'netopia'} to {'netopia','stripe_connect','viva'}.
--
-- Iulian directive 2026-05-10:
--   "implement only PSP abstraction and split-payment-ready architecture.
--    Stripe Connect is fallback/demo only. Primary marketplace target
--    remains Viva/Netopia once commercial config arrives."
--
-- Risk: LOW. Purely additive widening. Existing rows (0 in psp_credentials
-- per the 2026-05-09 audit; verified empty psp_payments + psp_webhook_events
-- since the adapter is V1 scaffold) keep their 'netopia' value, which
-- remains valid under the new constraint.
--
-- Reverse SQL (kept here for emergency rollback after sign-off):
--
--   alter table public.psp_credentials drop constraint psp_credentials_provider_check;
--   alter table public.psp_credentials add constraint psp_credentials_provider_check
--     check (provider in ('netopia'));
--   alter table public.psp_payments drop constraint psp_payments_provider_check;
--   alter table public.psp_payments add constraint psp_payments_provider_check
--     check (provider in ('netopia'));
--   alter table public.psp_webhook_events drop constraint psp_webhook_events_provider_check;
--   alter table public.psp_webhook_events add constraint psp_webhook_events_provider_check
--     check (provider in ('netopia'));
--
-- Idempotent. Safe to re-apply.

-- Defensive: drop any existing provider CHECK constraint by inspecting
-- pg_constraint, since Postgres auto-names un-named CHECK constraints with
-- a `<table>_<column>_check` pattern but that is not 100% guaranteed across
-- pg versions / supabase replicas.

do $$
declare
  con_name text;
begin
  -- psp_credentials
  for con_name in
    select conname from pg_constraint
    where conrelid = 'public.psp_credentials'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%provider%'
  loop
    execute format('alter table public.psp_credentials drop constraint %I', con_name);
  end loop;

  -- psp_payments
  for con_name in
    select conname from pg_constraint
    where conrelid = 'public.psp_payments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%provider%'
  loop
    execute format('alter table public.psp_payments drop constraint %I', con_name);
  end loop;

  -- psp_webhook_events
  for con_name in
    select conname from pg_constraint
    where conrelid = 'public.psp_webhook_events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%provider%'
  loop
    execute format('alter table public.psp_webhook_events drop constraint %I', con_name);
  end loop;
end$$;

alter table public.psp_credentials
  add constraint psp_credentials_provider_check
  check (provider in ('netopia', 'stripe_connect', 'viva'));

alter table public.psp_payments
  add constraint psp_payments_provider_check
  check (provider in ('netopia', 'stripe_connect', 'viva'));

alter table public.psp_webhook_events
  add constraint psp_webhook_events_provider_check
  check (provider in ('netopia', 'stripe_connect', 'viva'));
