-- GloriaFood importer — track import runs.
-- Per ~/.hir/research/gloriafood-deep-dive.md: GloriaFood EOL 2027-04-30,
-- Master Key API at https://www.beta.gloriafood.com/v2/master/<key>/menus
-- returns the restaurant's menu structure. We import categories + items
-- into our restaurant_menu_categories / restaurant_menu_items.
--
-- master_key_hash = sha256 of the master key — never store raw keys.
-- This lets the operator (or Iulian) retry an import on the same source
-- without re-entering it on every retry, and without leaving the secret in
-- the audit log.

create table if not exists public.gloriafood_import_runs (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  master_key_hash     text not null,
  status              text not null default 'PENDING'
    check (status in ('PENDING', 'PREVIEWING', 'IMPORTING', 'DONE', 'FAILED')),
  categories_seen     int not null default 0,
  items_seen          int not null default 0,
  categories_inserted int not null default 0,
  items_inserted      int not null default 0,
  items_skipped       int not null default 0,
  raw_preview         jsonb,
  error_message       text,
  started_at          timestamptz not null default now(),
  finished_at         timestamptz
);

create index if not exists gloriafood_import_runs_tenant_idx
  on public.gloriafood_import_runs (tenant_id, started_at desc);

alter table public.gloriafood_import_runs enable row level security;
drop policy if exists "service_role_only_gloriafood_import_runs" on public.gloriafood_import_runs;
create policy "service_role_only_gloriafood_import_runs"
  on public.gloriafood_import_runs for all
  to service_role using (true) with check (true);

-- restaurant_menu_items.external_source — track origin so we can dedupe on
-- re-import and so the admin UI can show "imported from GloriaFood" badges.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'restaurant_menu_items'
      and column_name = 'external_source'
  ) then
    alter table public.restaurant_menu_items add column external_source text;
    alter table public.restaurant_menu_items add column external_id text;
    create unique index if not exists restaurant_menu_items_external_unique
      on public.restaurant_menu_items (tenant_id, external_source, external_id)
      where external_source is not null;
  end if;
end$$;

comment on table public.gloriafood_import_runs is
  'Per-tenant audit log of GloriaFood importer runs. Stores master_key as sha256 hash only.';
