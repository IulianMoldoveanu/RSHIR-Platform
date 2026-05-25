-- HIR Connect self-service lead capture from /connect page.
-- Prospects with their own ordering site submit interest; we contact them
-- within 24h to onboard via /dashboard/admin/onboard/connect (PR #739).

do $$ begin
  create type public.connect_lead_status as enum (
    'NEW',
    'CONTACTED',
    'ONBOARDED',
    'REJECTED'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.connect_leads (
  id uuid primary key default gen_random_uuid(),
  restaurant_name text not null check (length(trim(restaurant_name)) between 2 and 200),
  contact_email text not null check (length(contact_email) between 6 and 254),
  contact_phone text check (length(contact_phone) <= 32),
  website_url text not null check (website_url ~ '^https?://'),
  estimated_orders_per_day int check (estimated_orders_per_day between 0 and 10000),
  notes text check (length(notes) <= 2000),
  status public.connect_lead_status not null default 'NEW',
  source text not null default 'web_form',
  ip text,
  user_agent text,
  internal_notes text,
  created_at timestamptz not null default now(),
  contacted_at timestamptz,
  onboarded_at timestamptz,
  onboarded_tenant_id uuid references public.tenants(id) on delete set null
);

create index if not exists ix_connect_leads_status_created
  on public.connect_leads(status, created_at desc);
create index if not exists ix_connect_leads_email
  on public.connect_leads(contact_email);

alter table public.connect_leads enable row level security;

-- Public can NEVER read. Service role bypasses RLS for the form insert.
-- Platform admins (via the dashboard's service-role client) get reads.
drop policy if exists "no public read connect_leads" on public.connect_leads;
create policy "no public read connect_leads" on public.connect_leads
  for select using (false);

drop policy if exists "no public write connect_leads" on public.connect_leads;
create policy "no public write connect_leads" on public.connect_leads
  for insert with check (false);

comment on table public.connect_leads is
  'HIR Connect self-service form submissions from /connect (PR #740). '
  'Inserted via service role from /api/connect/lead. Read-only via platform '
  'admin dashboard. Owner workflow: NEW -> CONTACTED -> ONBOARDED (links to tenants.id).';
