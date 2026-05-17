-- Customer Reactivation feature
-- Table: tracks when a patron contacted a lost customer
-- View: surfaces customers who haven't ordered in 30-180 days with 2+ orders
--
-- Schema reference: restaurant_orders.customer_id → customers.id;
-- customers has (id, tenant_id, first_name, phone). The view derives
-- phone via JOIN since restaurant_orders has no inline customer_phone.

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

alter table public.customer_reactivation_contacts enable row level security;

drop policy if exists "tenant members can select reactivation contacts"
  on public.customer_reactivation_contacts;
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

drop policy if exists "tenant members can insert reactivation contacts"
  on public.customer_reactivation_contacts;
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

-- View: lost customers = 2+ orders, last order 30-180 days ago,
-- not contacted in the last 14 days. Phone derived from customers table.
create or replace view public.v_lost_customers as
with order_stats as (
  select
    o.tenant_id,
    c.phone as customer_phone,
    c.first_name as customer_first_name,
    max(o.created_at)                        as last_order_at,
    round(max(o.total_ron) * 100)::bigint    as last_order_total_cents,
    count(*)::int                            as order_count
  from public.restaurant_orders o
  join public.customers c on c.id = o.customer_id
  where c.phone is not null
    and o.status not in ('CANCELLED')
  group by o.tenant_id, c.phone, c.first_name
  having
    count(*) >= 2
    and max(o.created_at) < now() - interval '30 days'
    and max(o.created_at) > now() - interval '180 days'
),
top_items as (
  select distinct on (o.tenant_id, c.phone)
    o.tenant_id,
    c.phone as customer_phone,
    item->>'name' as top_item_name,
    count(*) over (partition by o.tenant_id, c.phone, item->>'name') as item_freq
  from public.restaurant_orders o
  join public.customers c on c.id = o.customer_id,
       jsonb_array_elements(o.items) as item
  where c.phone is not null
    and o.status not in ('CANCELLED')
  order by o.tenant_id, c.phone, item_freq desc
),
recently_contacted as (
  select distinct tenant_id, customer_phone
  from public.customer_reactivation_contacts
  where contacted_at > now() - interval '14 days'
)
select
  os.tenant_id,
  os.customer_phone,
  coalesce(os.customer_first_name, 'Client') as customer_first_name,
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
);

grant select on public.v_lost_customers to authenticated;
