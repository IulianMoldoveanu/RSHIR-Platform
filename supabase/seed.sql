-- HIR Restaurant Suite - demo seed (idempotent)
-- 2 demo tenants in Brasov, each with one category + 3 menu items.

-- Tenants
insert into public.tenants (slug, name, vertical, custom_domain, status)
values
  ('tenant1', 'Pizzeria Demo Brasov Centru', 'RESTAURANT', 'tenant1.lvh.me', 'ACTIVE'),
  ('tenant2', 'Bistro Demo Brasov Periferie', 'RESTAURANT', 'tenant2.lvh.me', 'ACTIVE')
on conflict (slug) do update set
  name = excluded.name,
  custom_domain = excluded.custom_domain,
  status = excluded.status;

-- Categories + items for tenant1 (Pizzeria)
do $$
declare
  t1_id uuid;
  t2_id uuid;
  cat1_id uuid;
  cat2_id uuid;
begin
  select id into t1_id from public.tenants where slug = 'tenant1';
  select id into t2_id from public.tenants where slug = 'tenant2';

  -- Tenant 1 category
  insert into public.restaurant_menu_categories (tenant_id, name, sort_order)
  values (t1_id, 'Pizza', 0)
  on conflict do nothing;
  select id into cat1_id from public.restaurant_menu_categories where tenant_id = t1_id and name = 'Pizza' limit 1;

  insert into public.restaurant_menu_items (tenant_id, category_id, name, description, price_ron, sort_order)
  values
    (t1_id, cat1_id, 'Margherita',     'Sos rosii, mozzarella, busuioc',          32.00, 0),
    (t1_id, cat1_id, 'Quattro Formaggi','Mozzarella, gorgonzola, parmezan, brie',  42.00, 1),
    (t1_id, cat1_id, 'Diavola',        'Salam picant, mozzarella, ardei iute',    38.00, 2)
  on conflict do nothing;

  -- Tenant 2 category
  insert into public.restaurant_menu_categories (tenant_id, name, sort_order)
  values (t2_id, 'Mancare gatita', 0)
  on conflict do nothing;
  select id into cat2_id from public.restaurant_menu_categories where tenant_id = t2_id and name = 'Mancare gatita' limit 1;

  insert into public.restaurant_menu_items (tenant_id, category_id, name, description, price_ron, sort_order)
  values
    (t2_id, cat2_id, 'Ciorba de burta',   'Cu smantana si ardei iute', 22.00, 0),
    (t2_id, cat2_id, 'Sarmale cu mamaliga','Tradtitionale, 4 buc',     35.00, 1),
    (t2_id, cat2_id, 'Mici cu mustar',     'Set de 5 mici',            28.00, 2)
  on conflict do nothing;
end;
$$;
