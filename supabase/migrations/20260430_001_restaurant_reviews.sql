-- HIR Restaurant Suite - RSHIR-39 Customer reviews
-- Order-level rating (1-5) + optional comment, one review per order.
-- Anonymous customer submission is gated by knowing the order's
-- public_track_token (same secret already used to view /track/<token>).
-- Idempotent: re-running the migration is a no-op.

-- ============================================================
-- TABLE
-- ============================================================
create table if not exists public.restaurant_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null unique references public.restaurant_orders(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists restaurant_reviews_tenant_id_created_at_idx
  on public.restaurant_reviews (tenant_id, created_at desc);

-- ============================================================
-- AGGREGATE VIEW (public-readable rollup per tenant)
-- ============================================================
create or replace view public.restaurant_review_summary as
  select
    tenant_id,
    count(*)::integer       as review_count,
    round(avg(rating)::numeric, 2) as average_rating
  from public.restaurant_reviews
  group by tenant_id;

-- ============================================================
-- RLS
-- ============================================================
alter table public.restaurant_reviews enable row level security;

drop policy if exists restaurant_reviews_tenant_member_read on public.restaurant_reviews;
create policy restaurant_reviews_tenant_member_read
  on public.restaurant_reviews
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = restaurant_reviews.tenant_id
        and tm.user_id  = auth.uid()
    )
  );

-- Customer write path goes via the SECURITY DEFINER RPC below; deny direct
-- inserts/updates from anon/authenticated to keep the only entry point the
-- token-validated function.
drop policy if exists restaurant_reviews_no_direct_write on public.restaurant_reviews;
create policy restaurant_reviews_no_direct_write
  on public.restaurant_reviews
  for insert
  to authenticated
  with check (false);

-- ============================================================
-- TOKEN-GATED INSERT RPC
-- ============================================================
-- The customer is anonymous on the storefront. Authentication is "you know
-- the order's public_track_token" — same trust model as /track/<token>.
-- Returns:
--   ok              - review created
--   already_reviewed- a review already exists for this order
--   not_delivered   - order is not in a terminal DELIVERED state
--   not_found       - token did not match an order
create or replace function public.submit_order_review(
  p_token uuid,
  p_rating smallint,
  p_comment text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order   record;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    return 'invalid_rating';
  end if;

  select id, tenant_id, status
    into v_order
    from public.restaurant_orders
   where public_track_token = p_token
   for update;

  if not found then
    return 'not_found';
  end if;

  if v_order.status <> 'DELIVERED' then
    return 'not_delivered';
  end if;

  if exists (select 1 from public.restaurant_reviews where order_id = v_order.id) then
    return 'already_reviewed';
  end if;

  insert into public.restaurant_reviews (tenant_id, order_id, rating, comment)
  values (
    v_order.tenant_id,
    v_order.id,
    p_rating,
    nullif(btrim(coalesce(p_comment, '')), '')
  );

  return 'ok';
end;
$$;

revoke all on function public.submit_order_review(uuid, smallint, text) from public;
grant execute on function public.submit_order_review(uuid, smallint, text) to anon, authenticated;
