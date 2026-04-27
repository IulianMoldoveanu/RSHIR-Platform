-- HIR Restaurant Suite — Sushi vertical demo bootstrap
--
-- Companion to supabase/demo-seed.sql (which seeds restaurant-demo with a
-- pizza/paste/băuturi menu). This script seeds a SUSHI tenant so the user
-- has visual variety while testing.
--
-- Idempotent: safe to re-run.
-- Run AFTER supabase/seed-admin.mjs has created admin@hir.local.

begin;

-- Tenant — different brand color, location implied as București so the
-- map / open-hours story is distinct from the Brașov demos.
insert into public.tenants (slug, name, vertical, status, settings)
values (
  'sushi-demo',
  'Sushi Demo București',
  'RESTAURANT',
  'ACTIVE',
  jsonb_build_object(
    'city', 'București',
    'contact_email', 'sushi@example.com',
    'pickup_enabled', true,
    'cod_enabled', false,
    'min_order_ron', 80,
    'free_delivery_threshold_ron', 150,
    'delivery_eta_min_minutes', 35,
    'delivery_eta_max_minutes', 50,
    'branding', jsonb_build_object('brand_color', '#dc2626')
  )
)
on conflict (slug) do update set
  name     = excluded.name,
  status   = excluded.status,
  settings = excluded.settings;

-- Categories + items
do $$
declare
  t_id uuid;
  cat_maki uuid;
  cat_nigiri uuid;
  cat_special uuid;
  cat_bowls uuid;
begin
  select id into t_id from public.tenants where slug = 'sushi-demo';

  insert into public.restaurant_menu_categories (tenant_id, name, sort_order)
  values
    (t_id, 'Maki Roll',           0),
    (t_id, 'Nigiri',               1),
    (t_id, 'Specialități',         2),
    (t_id, 'Bowl-uri',             3)
  on conflict do nothing;

  select id into cat_maki    from public.restaurant_menu_categories where tenant_id = t_id and name = 'Maki Roll'      limit 1;
  select id into cat_nigiri  from public.restaurant_menu_categories where tenant_id = t_id and name = 'Nigiri'         limit 1;
  select id into cat_special from public.restaurant_menu_categories where tenant_id = t_id and name = 'Specialități'   limit 1;
  select id into cat_bowls   from public.restaurant_menu_categories where tenant_id = t_id and name = 'Bowl-uri'       limit 1;

  -- Maki Roll
  insert into public.restaurant_menu_items (tenant_id, category_id, name, description, price_ron, sort_order, is_available)
  values
    (t_id, cat_maki, 'California Roll',     'Crab, avocado, castravete, sesam',                          38.00, 0, true),
    (t_id, cat_maki, 'Spicy Tuna',          'Ton, sos picant, ardei iute, ceapă verde',                  44.00, 1, true),
    (t_id, cat_maki, 'Salmon Avocado',      'Somon proaspăt, avocado, sos teriyaki',                     42.00, 2, true),
    (t_id, cat_maki, 'Vegetarian Roll',     'Castravete, avocado, ardei roșu, morcov',                   32.00, 3, true)
  on conflict do nothing;

  -- Nigiri
  insert into public.restaurant_menu_items (tenant_id, category_id, name, description, price_ron, sort_order, is_available)
  values
    (t_id, cat_nigiri, 'Nigiri Somon',      '2 buc., somon norvegian',                                   18.00, 0, true),
    (t_id, cat_nigiri, 'Nigiri Ton',        '2 buc., ton roșu',                                          22.00, 1, true),
    (t_id, cat_nigiri, 'Nigiri Creveți',    '2 buc., creveți tigru fierți',                              20.00, 2, true)
  on conflict do nothing;

  -- Specialități
  insert into public.restaurant_menu_items (tenant_id, category_id, name, description, price_ron, sort_order, is_available)
  values
    (t_id, cat_special, 'Set Omakase',      'Selecția chef-ului: 16 piese + miso',                       129.00, 0, true),
    (t_id, cat_special, 'Tempura Mix',      'Creveți, legume, sos tentsuyu',                              58.00, 1, true),
    (t_id, cat_special, 'Sashimi Trio',     '12 felii: somon, ton, levrek',                               89.00, 2, true)
  on conflict do nothing;

  -- Bowl-uri
  insert into public.restaurant_menu_items (tenant_id, category_id, name, description, price_ron, sort_order, is_available)
  values
    (t_id, cat_bowls, 'Poke Salmon',        'Orez sushi, somon marinat, edamame, mango, sesam',          54.00, 0, true),
    (t_id, cat_bowls, 'Poke Tofu',          'Tofu marinat, alge wakame, ardei, lime',                    46.00, 1, true)
  on conflict do nothing;
end;
$$;

-- Grant OWNER membership to admin@hir.local
do $$
declare
  admin_id uuid;
begin
  select id into admin_id from auth.users where email = 'admin@hir.local';
  if admin_id is null then
    raise notice 'admin@hir.local not found in auth.users — run supabase/seed-admin.mjs first';
    return;
  end if;

  insert into public.tenant_members (tenant_id, user_id, role)
  select t.id, admin_id, 'OWNER'
  from public.tenants t
  where t.slug = 'sushi-demo'
  on conflict (tenant_id, user_id) do update set role = excluded.role;
end;
$$;

commit;
