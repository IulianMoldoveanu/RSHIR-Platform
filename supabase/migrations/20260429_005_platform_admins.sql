-- HIR Courier Admin — platform_admins table
-- Guards the /admin/fleets route in the courier app.
-- Only rows in this table may access the fleet-management UI.
-- Service-role inserts; users read only their own row.
-- Idempotent.

create table if not exists public.platform_admins (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  role      text not null default 'admin',
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- A user can see only their own row (used by requirePlatformAdmin helper
-- to confirm the caller is an admin without leaking the full list).
drop policy if exists platform_admins_self_read on public.platform_admins;
create policy platform_admins_self_read on public.platform_admins
  for select to authenticated
  using (user_id = auth.uid());

-- Add key_prefix to courier_api_keys for the "show prefix only" UX.
-- key_hash already exists; prefix is the first 8 chars of the raw key.
alter table public.courier_api_keys
  add column if not exists key_prefix text;

-- Seed: insert the owner. Conditional on the email pattern — picks up any
-- address Iulian used when signing up, without hard-coding a UUID.
-- ON CONFLICT DO NOTHING makes this safe to re-run.
insert into public.platform_admins (user_id)
select id
  from auth.users
 where email ilike '%iulian%hir%'
    or email ilike '%hiraisolutions%'
    or email ilike 'iulianmoldoveanu@%'
on conflict (user_id) do nothing;
