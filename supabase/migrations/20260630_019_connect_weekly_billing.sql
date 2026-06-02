-- Connect deliveryhouse activation — gap #2: weekly HIR→tenant billing.
--
-- This is HIR invoicing the Connect (headless) TENANT for the delivery service
-- it provides — distinct from `smartbill_invoice_jobs` (which is the restaurant
-- invoicing ITS OWN customer per order via the restaurant's SmartBill account).
--
-- Model (LOCKED): per delivered order through the HIR courier pool, a headless
-- tenant owes (a) the zone delivery fee (delivery_pricings.restaurant_fee_cents,
-- computed by 20260630_018) + (b) a flat 2 RON/order "data layer" fee. Billed
-- WEEKLY (Mon–Sun, Europe/Bucharest), one invoice per tenant per week.
--
-- Invoices are generated as DRAFT for operator review (Iulian issues/pushes to
-- HIR's own SmartBill in a later step) — we never auto-issue a fiscal document.
-- Idempotent per (tenant, period_start). READS courier_orders + delivery_pricings;
-- does NOT touch cities / pricing_zones / courier_profiles (multi-session safe).

-- ── 1. Ledger ───────────────────────────────────────────────────────────────
create table if not exists public.connect_tenant_invoices (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        not null references public.tenants(id) on delete cascade,
  period_start         date        not null,
  period_end           date        not null,
  orders_count         int         not null default 0,
  -- Zone delivery fees the tenant owes HIR (sum of latest delivery_pricings).
  delivery_fees_cents  int         not null default 0,
  -- Data-layer fee = 2 RON (200 bani) × orders_count.
  data_fee_cents       int         not null default 0,
  total_cents          int         generated always as (delivery_fees_cents + data_fee_cents) stored,
  currency             text        not null default 'RON',
  status               text        not null default 'DRAFT'
                                   check (status in ('DRAFT', 'ISSUED', 'PAID', 'VOID')),
  -- Snapshot of how the figures were produced (tz, fee/order, generator).
  breakdown            jsonb       not null default '{}'::jsonb,
  smartbill_invoice_id text,
  created_at           timestamptz not null default now(),
  issued_at            timestamptz,
  paid_at              timestamptz,
  constraint connect_tenant_invoices_period_valid check (period_end >= period_start),
  -- One invoice per tenant per billing week — makes generation idempotent.
  constraint connect_tenant_invoices_tenant_period_uk unique (tenant_id, period_start)
);

create index if not exists idx_connect_tenant_invoices_tenant
  on public.connect_tenant_invoices (tenant_id, period_start desc);
create index if not exists idx_connect_tenant_invoices_status
  on public.connect_tenant_invoices (status, period_start desc);

comment on table public.connect_tenant_invoices is
  'Weekly HIR→tenant billing for headless (Connect) tenants: zone delivery fees + 2 RON/order data layer. DRAFT-by-default (operator reviews before issuing). One row per tenant per week.';

-- ── 2. Weekly generator ─────────────────────────────────────────────────────
-- Generates DRAFT invoices for the billing week (Mon–Sun, Europe/Bucharest).
-- p_period_start NULL ⇒ the PREVIOUS complete week. Returns # invoices created.
create or replace function public.fn_generate_connect_weekly_invoices(p_period_start date default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date;
  v_end date;
  v_created int;
begin
  -- Default: the previous complete ISO week (Monday start) in Bucharest time.
  if p_period_start is null then
    v_start := (date_trunc('week', (now() at time zone 'Europe/Bucharest')) - interval '7 days')::date;
  else
    v_start := date_trunc('week', p_period_start::timestamp)::date;
  end if;
  v_end := v_start + 6;

  with latest_pricing as (
    select distinct on (delivery_id) delivery_id, restaurant_fee_cents
      from public.delivery_pricings
     order by delivery_id, computed_at desc
  ),
  agg as (
    select
      co.source_tenant_id as tenant_id,
      count(*)::int as orders_count,
      coalesce(sum(lp.restaurant_fee_cents), 0)::int as delivery_fees_cents
    from public.courier_orders co
    join public.tenants t
      on t.id = co.source_tenant_id and t.delivery_mode = 'headless'
    left join latest_pricing lp on lp.delivery_id = co.id
    where co.status = 'DELIVERED'
      and co.source_tenant_id is not null
      and (co.delivered_at at time zone 'Europe/Bucharest')::date between v_start and v_end
    group by co.source_tenant_id
  ),
  ins as (
    insert into public.connect_tenant_invoices
      (tenant_id, period_start, period_end, orders_count, delivery_fees_cents, data_fee_cents, breakdown)
    select
      a.tenant_id, v_start, v_end, a.orders_count, a.delivery_fees_cents,
      200 * a.orders_count,
      jsonb_build_object(
        'generated_by', 'weekly-cron',
        'tz', 'Europe/Bucharest',
        'data_fee_per_order_cents', 200,
        'generated_at', now()
      )
    from agg a
    on conflict (tenant_id, period_start) do nothing
    returning 1
  )
  select count(*)::int into v_created from ins;

  return coalesce(v_created, 0);
end;
$$;

comment on function public.fn_generate_connect_weekly_invoices(date) is
  'Generates DRAFT weekly invoices (Mon–Sun, Europe/Bucharest) for headless tenants: '
  'sum of latest delivery_pricings.restaurant_fee_cents + 200 bani/order data fee. '
  'Idempotent per (tenant, week). NULL arg = previous complete week.';

-- ── 3. RLS — tenant reads own invoices; service_role manages ────────────────
alter table public.connect_tenant_invoices enable row level security;

drop policy if exists connect_invoices_tenant_read on public.connect_tenant_invoices;
create policy connect_invoices_tenant_read on public.connect_tenant_invoices
  for select to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = connect_tenant_invoices.tenant_id and tm.user_id = auth.uid()
    )
  );

drop policy if exists connect_invoices_service_all on public.connect_tenant_invoices;
create policy connect_invoices_service_all on public.connect_tenant_invoices
  for all to service_role using (true) with check (true);

revoke all on function public.fn_generate_connect_weekly_invoices(date) from public, anon, authenticated;
grant execute on function public.fn_generate_connect_weekly_invoices(date) to service_role;

-- ── 4. pg_cron — every Monday 03:00 UTC, bill the previous week ─────────────
create extension if not exists pg_cron;

do $$
declare existing_jobid bigint;
begin
  select jobid into existing_jobid from cron.job where jobname = 'connect-weekly-billing';
  if existing_jobid is not null then perform cron.unschedule(existing_jobid); end if;
end $$;

select cron.schedule(
  'connect-weekly-billing',
  '0 3 * * 1',
  $$ select public.fn_generate_connect_weekly_invoices(null); $$
);
