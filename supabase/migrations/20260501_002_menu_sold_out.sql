-- HIR Restaurant Suite — sold_out_until column on menu items.
-- Companion to in-flight 86-list code (sold-out-today UX).
-- Idempotent: re-runnable.

alter table public.restaurant_menu_items
  add column if not exists sold_out_until timestamptz;

create index if not exists restaurant_menu_items_sold_out_idx
  on public.restaurant_menu_items (tenant_id, sold_out_until)
  where sold_out_until is not null;
