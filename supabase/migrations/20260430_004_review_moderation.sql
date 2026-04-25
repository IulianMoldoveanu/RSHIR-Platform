-- HIR Restaurant Suite - RSHIR-46 Review moderation
-- Adds a soft-hide flag so tenants can hide spam / abusive reviews
-- without deleting them. Hidden reviews disappear from the public
-- aggregate (storefront pill + JSON-LD aggregateRating) and from
-- the analytics dashboard, but stay visible in the moderation UI
-- so OWNERs see what they hid.
-- Idempotent: safe to re-apply.

alter table public.restaurant_reviews
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references auth.users(id) on delete set null;

create index if not exists restaurant_reviews_visible_idx
  on public.restaurant_reviews (tenant_id, created_at desc)
  where hidden_at is null;

-- Refresh the public aggregate to skip hidden rows. Same shape as before;
-- only the WHERE clause changed.
create or replace view public.restaurant_review_summary as
  select
    tenant_id,
    count(*)::integer       as review_count,
    round(avg(rating)::numeric, 2) as average_rating
  from public.restaurant_reviews
  where hidden_at is null
  group by tenant_id;
