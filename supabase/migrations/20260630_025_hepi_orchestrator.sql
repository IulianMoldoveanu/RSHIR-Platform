-- Hepi Orchestrator — autonomy configuration for the Command Center copilot.
--
-- Hepi gains the ability to PROPOSE + (on approval) EXECUTE platform actions,
-- not just explain. Iulian controls how much it asks first:
--   - mode = 'confirm' (DEFAULT): every action is proposed and waits for an
--     explicit click before it runs. "Întreabă înainte de orice."
--   - mode = 'direct': Hepi executes immediately when Iulian asks (still
--     audited, still platform-admin gated). "Acțiune directă."
--
-- per_action_mode jsonb lets specific actions override the global mode later
-- (e.g. keep destructive ones on 'confirm' even in global 'direct'); unused in
-- this first cut but the column is here so the next step is data, not schema.
--
-- Singleton row (id = 'global'). RLS: service_role only (every reader/writer is
-- the platform-admin-gated server, using the service-role client). Additive.

create table if not exists public.hepi_settings (
  id text primary key default 'global',
  mode text not null default 'confirm' check (mode in ('confirm', 'direct')),
  per_action_mode jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.hepi_settings (id, mode) values ('global', 'confirm')
on conflict (id) do nothing;

alter table public.hepi_settings enable row level security;

drop policy if exists "service_role_all_hepi_settings" on public.hepi_settings;
create policy "service_role_all_hepi_settings"
  on public.hepi_settings
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.hepi_settings is
  'Singleton (id=global) autonomy config for the Hepi Command Center orchestrator. '
  'mode=confirm => propose + await approval; mode=direct => execute on ask. '
  'per_action_mode overrides per action id. Read/written by platform-admin-gated server only.';
