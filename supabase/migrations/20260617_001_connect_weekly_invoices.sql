-- HIR Connect — Weekly auto-invoicing.
--
-- For each HIR Connect tenant (delivery_mode = 'headless'), the
-- `connect-invoice-weekly` Edge Function runs every Monday 03:00 UTC and:
--   1. Counts DELIVERED orders for the previous Mon 00:00 UTC → Sun 23:59:59 UTC
--   2. Inserts a row here (UNIQUE guard = idempotent on double-fire)
--   3. Emails an invoice to all OWNER members via Resend
--
-- Fee structure (locked 2026-05-25):
--   Platform fee:  200 bani (2 RON) × order_count
--   Courier fee:   100 bani (1 RON) × courier_order_count  (hir_delivery_id NOT NULL)
--   Due:           5 calendar days from issue date (Monday)
--
-- Cron schedule: Monday 03:00 UTC
--   Winter (UTC+2): 05:00 EET   Summer (UTC+3): 06:00 EEST
--
-- Operators must seed the vault URL once:
--   select vault.create_secret(
--     'https://<project-ref>.functions.supabase.co/connect-invoice-weekly',
--     'connect_invoice_weekly_url',
--     'connect-invoice-weekly Edge Function URL'
--   );
-- Auth piggybacks on notify_new_order_secret (shared HIR_NOTIFY_SECRET).

-- ── 1. Table ──────────────────────────────────────────────────────────────────

create table if not exists public.connect_weekly_invoices (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        not null references public.tenants(id) on delete cascade,
  week_start           timestamptz not null,  -- Monday 00:00 UTC
  week_end             timestamptz not null,  -- Sunday 23:59:59.999 UTC
  order_count          integer     not null default 0,
  courier_order_count  integer     not null default 0,
  platform_fee_bani    integer     not null default 0,  -- order_count × 200
  courier_fee_bani     integer     not null default 0,  -- courier_order_count × 100
  total_bani           integer     not null default 0,
  status               text        not null default 'PENDING'
    constraint connect_weekly_invoices_status_check
      check (status in ('PENDING', 'PAID', 'OVERDUE', 'VOID')),
  due_date             date        not null,
  paid_at              timestamptz,
  notes                text,
  created_at           timestamptz not null default now(),
  constraint uq_connect_weekly_invoices_tenant_week
    unique (tenant_id, week_start)
);

-- ── 2. RLS ────────────────────────────────────────────────────────────────────

alter table public.connect_weekly_invoices enable row level security;

-- Tenant OWNER members can read their own invoices.
create policy "connect_weekly_invoices_owner_read"
  on public.connect_weekly_invoices
  for select
  using (
    exists (
      select 1
      from public.tenant_members tm
      where tm.tenant_id = connect_weekly_invoices.tenant_id
        and tm.user_id   = auth.uid()
        and tm.role      = 'OWNER'
    )
  );

-- ── 3. Indexes ────────────────────────────────────────────────────────────────

create index if not exists idx_cwi_tenant_week
  on public.connect_weekly_invoices (tenant_id, week_start desc);

create index if not exists idx_cwi_status_pending
  on public.connect_weekly_invoices (status, due_date)
  where status in ('PENDING', 'OVERDUE');

-- ── 4. Cron job ───────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  existing_jobid bigint;
begin
  select jobid into existing_jobid
  from cron.job
  where jobname = 'connect-invoice-weekly';

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'connect-invoice-weekly',
  '0 3 * * 1',  -- Monday 03:00 UTC (05:00 EET / 06:00 EEST)
  $$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets
                  where name = 'connect_invoice_weekly_url' limit 1),
      headers := jsonb_build_object(
        'Content-Type',        'application/json',
        'x-hir-notify-secret', (select decrypted_secret from vault.decrypted_secrets
                                where name = 'notify_new_order_secret' limit 1)
      ),
      body    := '{}'::jsonb
    );
  $$
);
