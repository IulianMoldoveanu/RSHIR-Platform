-- Records which vertical template a tenant was created from.
-- Additive only — nullable, no default. Existing tenants stay NULL.
-- The 5 slugs map 1:1 to packages/restaurant-templates.

-- Column (idempotent).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenants'
      and column_name = 'template_slug'
  ) then
    alter table public.tenants
      add column template_slug text;
  end if;
end$$;

-- CHECK constraint (idempotent — drop-if-exists then add).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'tenants_template_slug_check'
      and conrelid = 'public.tenants'::regclass
  ) then
    alter table public.tenants drop constraint tenants_template_slug_check;
  end if;

  alter table public.tenants
    add constraint tenants_template_slug_check
    check (
      template_slug is null
      or template_slug in (
        'italian',
        'asian',
        'fine-dining',
        'bistro',
        'romanian-traditional'
      )
    );
end$$;
