-- Customer Reactivation feature
-- Table: tracks when a patron contacted a lost customer
-- View: surfaces customers who haven't ordered in 30-180 days with 2+ orders

-- ============================================================
-- CONTACT LOG
-- ============================================================
create table if not exists public.customer_reactivation_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_phone text not null,
  contacted_at timestamptz not null default now(),
  channel text not null check (channel in ('whatsapp', 'sms', 'manual')),
  template_used text
);

create index if not exists idx_reactivation_contacts_tenant_phone
  on public.customer_reactivation_contacts(tenant_id, customer_phone, contacted_at desc);

-- RLS: tenant members can insert + select their own rows
alter table public.customer_reactivation_contacts enable row level security;

create policy "tenant members can select reactivation contacts"
  on public.customer_reactivation_contacts
  for select
  using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = customer_reactivation_contacts.tenant_id
        and tm.user_id = auth.uid()
    )
  );

create policy "tenant members can insert reactivation contacts"
  on public.customer_reactivation_contacts
  for insert
  with check (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = customer_reactivation_contacts.tenant_id
        and tm.user_id = auth.uid()
    )
  );

-- ============================================================
-- VIEW: lost customers per tenant
-- Lost = 2+ orders, last order 30-180 days ago,
--        not contacted in the last 14 days
-- ============================================================
create or replace view public.v_lost_customers as
with order_stats as (
  select
    o.tenant_id,
    o.customer_phone,
    -- first_name from the most recent order's customer row
    (
      select c.first_name
      from public.customers c
      where c.id = (
        select o2.customer_id
        from public.restaurant_orders o2
        where o2.tenant_id = o.tenant_id
          and o2.customer_phone = o.customer_phone
          and o2.customer_id is not null
        order by o2.created_at desc
        limit 1
      )
    ) as customer_first_name,
    max(o.created_at)                        as last_order_at,
    round(max(o.total_ron) * 100)::bigint    as last_order_total_cents,
    count(*)::int                            as order_count
  from public.restaurant_orders o
  where o.customer_phone is not null
    and o.status not in ('CANCELLED')
  group by o.tenant_id, o.customer_phone
  having
    count(*) >= 2
    and max(o.created_at) < now() - interval '30 days'
    and max(o.created_at) > now() - interval '180 days'
),
top_items as (
  -- most-frequently-ordered item name per tenant+phone
  select distinct on (o.tenant_id, o.customer_phone)
    o.tenant_id,
    o.customer_phone,
    item->>'name' as top_item_name,
    count(*) over (partition by o.tenant_id, o.customer_phone, item->>'name') as item_freq
  from public.restaurant_orders o,
       jsonb_array_elements(o.items) as item
  where o.customer_phone is not null
    and o.status not in ('CANCELLED')
  order by o.tenant_id, o.customer_phone, item_freq desc
),
recently_contacted as (
  select distinct tenant_id, customer_phone
  from public.customer_reactivation_contacts
  where contacted_at > now() - interval '14 days'
)
select
  os.tenant_id,
  os.customer_phone,
  coalesce(os.customer_first_name, split_part(os.customer_phone, '', 1)) as customer_first_name,
  os.last_order_at,
  os.last_order_total_cents,
  os.order_count,
  ti.top_item_name
from order_stats os
left join top_items ti
  on ti.tenant_id = os.tenant_id and ti.customer_phone = os.customer_phone
where not exists (
  select 1 from recently_contacted rc
  where rc.tenant_id = os.tenant_id
    and rc.customer_phone = os.customer_phone
)
order by os.last_order_at desc;

-- RLS on the view is enforced through the underlying tables.
-- Grant select to authenticated role so tenant members can query it.
grant select on public.v_lost_customers to authenticated;
