-- Courier ratings + complaints (fleet marketplace Phase 2).
--
-- GAP: today the only reviews in the system are for restaurants/pharmacists.
-- There is no signal on the COURIER -- which is exactly the input the SLA engine
-- + concentration scoring (Phase 3) need to reward good fleets and de-prioritise
-- bad ones. This adds:
--   * delivery_ratings    -- 1-5 stars + tags, one per delivered order, filed by
--                            the customer from the public track page (anon).
--   * delivery_complaints -- the more serious channel (not-delivered, damaged,
--                            cold-chain broken, fraud...), with a light status.
--   * submit_delivery_rating() -- token-gated SECURITY DEFINER RPC so an anon
--                            customer can rate without exposing the table.
--   * courier_rating_summary -- per-courier average a courier can see for self.
--
-- canonical_order_id is stored so ratings join the platform_order_events log.
-- No raw PII beyond an optional free-text comment (customer-authored review).

-- 1. Ratings -------------------------------------------------------------------
create table if not exists public.delivery_ratings (
  id                 uuid primary key default gen_random_uuid(),
  courier_order_id   uuid not null unique,            -- one rating per delivery
  courier_user_id    uuid,                            -- denormalised: "courier's average"
  source_tenant_id   uuid,                            -- which vendor's order
  canonical_order_id text,                            -- link to platform_order_events
  stars              smallint not null check (stars between 1 and 5),
  tags               text[] not null default '{}',    -- validated by the submit RPC
  comment            text,
  rated_by_role      text not null default 'customer',
  created_at         timestamptz not null default now()
);

create index if not exists idx_ratings_courier on public.delivery_ratings (courier_user_id);
create index if not exists idx_ratings_tenant  on public.delivery_ratings (source_tenant_id);

comment on table public.delivery_ratings is
  'Fleet marketplace Phase 2: customer rating (1-5 + tags) of a delivered '
  'courier_order. One per order. Filed via submit_delivery_rating() from the '
  'public track page. Feeds the Phase 3 SLA/scoring engine.';

-- 2. Complaints ----------------------------------------------------------------
create table if not exists public.delivery_complaints (
  id                 uuid primary key default gen_random_uuid(),
  courier_order_id   uuid not null,
  courier_user_id    uuid,
  source_tenant_id   uuid,
  canonical_order_id text,
  category           text not null,                   -- NOT_DELIVERED|DAMAGED|LATE|RUDE|COLD_CHAIN_BROKEN|FRAUD|OTHER
  description        text,
  status             text not null default 'OPEN',     -- OPEN|INVESTIGATING|RESOLVED|DISMISSED
  resolution_note    text,
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz
);

create index if not exists idx_complaints_courier on public.delivery_complaints (courier_user_id);
create index if not exists idx_complaints_status   on public.delivery_complaints (status);

comment on table public.delivery_complaints is
  'Fleet marketplace Phase 2: serious delivery complaints (not-delivered, '
  'damaged, cold-chain broken, fraud). Light status workflow. Feeds Phase 3 '
  'fleet de-prioritisation + KYC fraud signals.';

-- 3. Token-gated submission RPC ------------------------------------------------
-- Anon customers rate from the public track page; they hold only the order's
-- public_track_token. SECURITY DEFINER + token gate keeps the table closed to
-- direct anon writes while still letting the legitimate customer rate once.
create or replace function public.submit_delivery_rating(
  p_track_token text,
  p_stars       integer,
  p_tags        text[] default '{}',
  p_comment     text   default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_order      public.courier_orders%rowtype;
  v_source     text;
  v_native     text;
  v_canonical  text;
  v_allowed    text[] := array['POLITE','COURTEOUS','ON_TIME','FAST','CAREFUL','COLD_CHAIN_OK',
                               'LEFT_WITHOUT_CALL','RUDE','LATE','DAMAGED','WRONG_ITEMS'];
  v_tag        text;
begin
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_stars');
  end if;

  select * into v_order from public.courier_orders where public_track_token = p_track_token;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'order_not_found');
  end if;
  if v_order.status <> 'DELIVERED' then
    return jsonb_build_object('ok', false, 'reason', 'not_delivered');
  end if;

  -- Validate every tag against the allowed set (keeps the data clean for scoring).
  foreach v_tag in array coalesce(p_tags, '{}') loop
    if not (v_tag = any (v_allowed)) then
      return jsonb_build_object('ok', false, 'reason', 'invalid_tag', 'tag', v_tag);
    end if;
  end loop;

  v_source := coalesce(nullif(v_order.vertical, ''), 'rshir');
  v_native := coalesce(nullif(v_order.source_order_id, ''), nullif(v_order.external_ref, ''),
                       v_order.restaurant_order_id::text, v_order.id::text);
  v_canonical := encode(extensions.digest(v_source || ':' || v_native, 'sha256'), 'hex');

  insert into public.delivery_ratings (
    courier_order_id, courier_user_id, source_tenant_id, canonical_order_id,
    stars, tags, comment
  ) values (
    v_order.id, v_order.assigned_courier_user_id, v_order.source_tenant_id, v_canonical,
    p_stars, coalesce(p_tags, '{}'), nullif(btrim(coalesce(p_comment, '')), '')
  )
  on conflict (courier_order_id) do nothing;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'already_rated');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.submit_delivery_rating(text, integer, text[], text) is
  'Fleet marketplace Phase 2: token-gated rating submission for the public track '
  'page. Validates DELIVERED + tag whitelist, inserts once per order. anon-callable '
  'on purpose (gated by public_track_token).';

revoke all on function public.submit_delivery_rating(text, integer, text[], text) from public;
grant execute on function public.submit_delivery_rating(text, integer, text[], text) to anon, authenticated, service_role;

-- 4. Per-courier average (courier sees their own) ------------------------------
create or replace view public.courier_rating_summary as
  select courier_user_id,
         count(*)                       as ratings_count,
         round(avg(stars), 2)           as avg_stars,
         count(*) filter (where 'LEFT_WITHOUT_CALL' = any (tags)) as left_without_call_count,
         count(*) filter (where 'COLD_CHAIN_OK'     = any (tags)) as cold_chain_ok_count
  from public.delivery_ratings
  where courier_user_id is not null
  group by courier_user_id;

comment on view public.courier_rating_summary is
  'Per-courier rating aggregate. RLS on delivery_ratings (courier self-read) '
  'scopes a courier to their own row; platform reads via service_role.';

-- 5. RLS -----------------------------------------------------------------------
-- Direct writes are closed (ratings flow only through the SECURITY DEFINER RPC;
-- complaints are filed server-side). Reads: a courier sees their own; a tenant
-- sees their orders' feedback; platform reads via service_role (bypasses RLS).
alter table public.delivery_ratings    enable row level security;
alter table public.delivery_complaints enable row level security;

drop policy if exists delivery_ratings_courier_read on public.delivery_ratings;
create policy delivery_ratings_courier_read on public.delivery_ratings
  for select to authenticated
  using (courier_user_id = auth.uid() or public.is_tenant_member(source_tenant_id));

drop policy if exists delivery_complaints_courier_read on public.delivery_complaints;
create policy delivery_complaints_courier_read on public.delivery_complaints
  for select to authenticated
  using (courier_user_id = auth.uid() or public.is_tenant_member(source_tenant_id));
