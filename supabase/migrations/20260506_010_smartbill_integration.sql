-- Lane SMARTBILL-API (2026-05-06)
--
-- SmartBill direct-API integration. Extends the manual-CSV export shipped
-- in PR #286 (apps/restaurant-admin/src/app/dashboard/settings/exports) with
-- automated invoice push from HIR straight into the restaurant's SmartBill
-- account. Manual CSV export remains untouched as the offline fallback.
--
-- Flow:
--   1. OWNER configures username + CIF + invoice series in
--      tenants.settings.smartbill (jsonb). The API token (sensitive) is
--      stored in Supabase Vault under `smartbill_api_token_<tenant_id>`,
--      never in jsonb. UI shows the token field as write-only / masked.
--   2. When auto_push_enabled is true and an order transitions to
--      DELIVERED, an AFTER UPDATE trigger inserts a smartbill_invoice_jobs
--      row with status PENDING.
--   3. A pg_cron job every 5 minutes invokes the `smartbill-push` Edge
--      Function, which picks up to N PENDING jobs (rate-limited per tenant)
--      and POSTs each to the SmartBill REST API. Status flips to SENT or
--      FAILED with smartbill_invoice_id / error_text.
--   4. A "Reîncearcă" button on the admin UI flips a FAILED row back to
--      PENDING (max 5 attempts; harder retries require operator escalation).
--
-- Settings shape under tenants.settings.smartbill (jsonb):
--   {
--     "enabled":             boolean default false,
--     "username":            string,             -- SmartBill account email
--     "cif":                 string,             -- CIF (no "RO" prefix)
--     "series_invoice":      string,             -- e.g. "HIR" or "FCT"
--     "auto_push_enabled":   boolean default false,
--     "last_sync_at":        timestamptz | null,
--     "last_test_status":    "OK" | "FAILED" | null,
--     "last_test_at":        timestamptz | null
--   }
--
-- Additive only. CSV export at /dashboard/settings/exports unaffected.
-- Idempotent: re-runnable.

-- ============================================================
-- 1. smartbill_invoice_jobs
-- ============================================================
create table if not exists public.smartbill_invoice_jobs (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  order_id                 uuid not null references public.restaurant_orders(id) on delete cascade,
  status                   text not null default 'PENDING'
                             check (status in ('PENDING','CLAIMED','SENT','FAILED','SKIPPED')),
  smartbill_invoice_id     text,
  smartbill_invoice_number text,
  smartbill_invoice_series text,
  error_text               text,
  attempts                 int not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- If the table already existed from a prior migration apply (without CLAIMED),
-- swap the CHECK constraint additively. Idempotent.
alter table public.smartbill_invoice_jobs
  drop constraint if exists smartbill_invoice_jobs_status_check;
alter table public.smartbill_invoice_jobs
  add constraint smartbill_invoice_jobs_status_check
  check (status in ('PENDING','CLAIMED','SENT','FAILED','SKIPPED'));

-- One job per (tenant, order). Re-firing the trigger on the same order is
-- a no-op; manual "Reîncearcă" flips status back to PENDING in place.
create unique index if not exists smartbill_invoice_jobs_tenant_order_uk
  on public.smartbill_invoice_jobs (tenant_id, order_id);

-- Worker pickup index: PENDING jobs newest first.
create index if not exists smartbill_invoice_jobs_pickup_idx
  on public.smartbill_invoice_jobs (tenant_id, status, created_at desc);

-- updated_at trigger (mirror convention used elsewhere).
create or replace function public.smartbill_invoice_jobs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists smartbill_invoice_jobs_updated_at
  on public.smartbill_invoice_jobs;
create trigger smartbill_invoice_jobs_updated_at
  before update on public.smartbill_invoice_jobs
  for each row execute function public.smartbill_invoice_jobs_set_updated_at();

-- RLS: tenant members read their own jobs; only service-role writes.
alter table public.smartbill_invoice_jobs enable row level security;

drop policy if exists smartbill_jobs_tenant_read on public.smartbill_invoice_jobs;
create policy smartbill_jobs_tenant_read on public.smartbill_invoice_jobs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_members tm
      where tm.tenant_id = smartbill_invoice_jobs.tenant_id
        and tm.user_id = auth.uid()
    )
  );

-- Writes are service-role only (server actions + Edge Function). No policy
-- granted to authenticated → falls through to service-role bypass.

-- ============================================================
-- 2. AFTER UPDATE OF status trigger on restaurant_orders
-- ============================================================
-- Inserts a PENDING smartbill_invoice_jobs row when:
--   - new.status = 'DELIVERED' and old.status was something else
--   - tenant has settings.smartbill.enabled = true
--   - tenant has settings.smartbill.auto_push_enabled = true
--   - payment_status in ('PAID','UNPAID') (matches CSV-export filter)
--
-- ON CONFLICT DO NOTHING — re-firing on a re-status is idempotent thanks
-- to the unique (tenant_id, order_id) index.

create or replace function public.smartbill_enqueue_on_delivered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings jsonb;
  v_enabled boolean;
  v_auto boolean;
begin
  if new.status is null
     or new.status = old.status
     or new.status <> 'DELIVERED' then
    return new;
  end if;

  if new.payment_status not in ('PAID','UNPAID') then
    return new;
  end if;

  select settings into v_settings
    from public.tenants where id = new.tenant_id;
  if v_settings is null then return new; end if;

  v_enabled := coalesce((v_settings->'smartbill'->>'enabled')::boolean, false);
  v_auto    := coalesce((v_settings->'smartbill'->>'auto_push_enabled')::boolean, false);
  if not v_enabled or not v_auto then
    return new;
  end if;

  insert into public.smartbill_invoice_jobs (tenant_id, order_id, status)
  values (new.tenant_id, new.id, 'PENDING')
  on conflict (tenant_id, order_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_orders_smartbill_enqueue on public.restaurant_orders;
create trigger trg_orders_smartbill_enqueue
  after update of status on public.restaurant_orders
  for each row
  when (new.status = 'DELIVERED' and new.status is distinct from old.status)
  execute function public.smartbill_enqueue_on_delivered();

-- ============================================================
-- 3. Vault helper RPCs (service-role only)
-- ============================================================
-- The vault.* schema is not in the PostgREST cache, so server actions and
-- the Edge Function cannot read/write secrets directly. We expose three
-- thin SECURITY DEFINER wrappers and revoke execute from anon/authenticated
-- so only the service-role JWT can invoke them.

create or replace function public.hir_read_vault_secret(secret_name text)
returns text
language plpgsql
security definer
set search_path = vault, public
as $$
declare
  v_value text;
begin
  select decrypted_secret into v_value
    from vault.decrypted_secrets where name = secret_name limit 1;
  return v_value;
end;
$$;

create or replace function public.hir_write_vault_secret(
  secret_name text,
  secret_value text,
  secret_description text default null
)
returns void
language plpgsql
security definer
set search_path = vault, public
as $$
declare
  v_existing uuid;
begin
  select id into v_existing from vault.secrets where name = secret_name limit 1;
  if v_existing is null then
    perform vault.create_secret(secret_value, secret_name, coalesce(secret_description, ''));
  else
    perform vault.update_secret(v_existing, secret_value, secret_name, coalesce(secret_description, ''));
  end if;
end;
$$;

create or replace function public.hir_delete_vault_secret(secret_name text)
returns void
language plpgsql
security definer
set search_path = vault, public
as $$
begin
  delete from vault.secrets where name = secret_name;
end;
$$;

revoke all on function public.hir_read_vault_secret(text) from public, anon, authenticated;
revoke all on function public.hir_write_vault_secret(text, text, text) from public, anon, authenticated;
revoke all on function public.hir_delete_vault_secret(text) from public, anon, authenticated;
grant execute on function public.hir_read_vault_secret(text) to service_role;
grant execute on function public.hir_write_vault_secret(text, text, text) to service_role;
grant execute on function public.hir_delete_vault_secret(text) to service_role;

-- ============================================================
-- 4. pg_cron — pickup every 5 min
-- ============================================================
-- Operator setup (run ONCE separately to seed the URL):
--   select vault.create_secret(
--     'https://qfmeojeipncuxeltnvab.functions.supabase.co/smartbill-push',
--     'smartbill_push_url',
--     'smartbill-push Edge Function URL');
-- HIR_NOTIFY_SECRET on the function reuses notify_new_order_secret.
--
-- Authorization header: requests to *.functions.supabase.co are rejected
-- with UNAUTHORIZED_NO_AUTH_HEADER by the gateway unless an Authorization
-- bearer is present, regardless of the function's verify_jwt setting (see
-- 20260501_006_notify_jwt_gateway_fix.sql). We reuse the existing
-- `notify_function_anon_jwt` vault secret. The bearer is gateway plumbing
-- only — the real auth gate remains x-hir-notify-secret on the function.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  existing_jobid bigint;
begin
  select jobid into existing_jobid
  from cron.job
  where jobname = 'smartbill-push-pickup';

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'smartbill-push-pickup',
  '*/5 * * * *',
  $$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets
                  where name = 'smartbill_push_url' limit 1),
      headers := jsonb_build_object(
        'Content-Type',        'application/json',
        'Authorization',       'Bearer ' || coalesce(
          (select decrypted_secret from vault.decrypted_secrets
            where name = 'notify_function_anon_jwt' limit 1),
          ''
        ),
        'x-hir-notify-secret', (select decrypted_secret from vault.decrypted_secrets
                                where name = 'notify_new_order_secret' limit 1)
      ),
      body    := jsonb_build_object('mode','pickup')
    );
  $$
);
