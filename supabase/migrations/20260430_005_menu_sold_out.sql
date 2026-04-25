-- HIR Restaurant Suite - RSHIR-49 per-item "sold out today"
-- Adds an auto-clearing per-item availability flag distinct from the
-- persistent `is_available` toggle. Storefront treats the item as
-- unavailable while `sold_out_until > now()`; the value is set by the
-- admin to the end of the current business day, so it implicitly clears
-- once the tenant's next opening time arrives.
-- Idempotent: safe to re-apply.

alter table public.restaurant_menu_items
  add column if not exists sold_out_until timestamptz;

-- Partial index — only rows that are actually sold-out today need to be
-- looked up by this column; null rows (the vast majority) stay out of the
-- index.
create index if not exists idx_menu_items_tenant_sold_out_until
  on public.restaurant_menu_items (tenant_id, sold_out_until)
  where sold_out_until is not null;
