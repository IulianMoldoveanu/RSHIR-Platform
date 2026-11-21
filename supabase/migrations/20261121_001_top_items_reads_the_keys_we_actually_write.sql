-- 2026-11-21 - The best-sellers view read keys nothing ever wrote.
--
-- `v_top_items` powers the "ce s-a dat cel mai bine" panel, which is a named
-- part of what a vendor pays the subscription for. It has never returned a
-- single row, for any tenant, since it was created.
--
-- It pulls line items out of `restaurant_orders.items` (a jsonb array) using
-- snake_case keys. Both writers use camelCase:
--
--   view looks for            what is actually stored
--   ----------------------    -----------------------------------------
--   item_id / id              itemId        (storefront)
--                             (no id)       (public API - free-text items
--                                            from the vendor's own catalogue)
--   price_ron / price         priceRon      (both writers)
--
-- and then filters `WHERE item_id IS NOT NULL`, so every row is discarded.
--
-- Counted over every non-cancelled order in history (25 line items), before
-- this change:
--
--   line items total                        25
--   matched by item_id / id                  0   <- why the panel is empty
--   matched once itemId is added            25
--   price matched by price_ron / price       0   <- revenue would be 0 anyway
--   price matched once priceRon is added    25
--
-- The name fallback is not a nicety. Orders arriving through HIR Connect
-- carry free-text items from the vendor's own menu and can never have an id
-- in our system, so without it a Connect vendor's panel stays empty forever
-- no matter how much they sell.
--
-- Strictly additive: an item that already carries an id still groups by that
-- id, so nothing that works today changes behaviour. The body below is
-- `pg_get_viewdef` of the live view with only those two coalesce chains
-- touched.

create or replace view public.v_top_items as
WITH line_items AS (
         SELECT o.tenant_id,
            COALESCE(li.value ->> 'item_id'::text, li.value ->> 'id'::text,
                     li.value ->> 'itemId'::text, lower(li.value ->> 'name'::text)) AS item_id,
            COALESCE(li.value ->> 'name'::text, li.value ->> 'item_name'::text, 'Unknown'::text) AS item_name,
            COALESCE((li.value ->> 'quantity'::text)::integer, (li.value ->> 'qty'::text)::integer, 1) AS quantity,
            COALESCE((li.value ->> 'price_ron'::text)::numeric, (li.value ->> 'price'::text)::numeric,
                     (li.value ->> 'priceRon'::text)::numeric, 0::numeric) AS price_ron
           FROM restaurant_orders o
             CROSS JOIN LATERAL jsonb_array_elements(
                CASE
                    WHEN jsonb_typeof(o.items) = 'array'::text THEN o.items
                    ELSE '[]'::jsonb
                END) li(value)
          WHERE o.status <> 'CANCELLED'::text AND o.created_at >= (now() - '30 days'::interval)
        ), aggregated AS (
         SELECT line_items.tenant_id,
            line_items.item_id,
            max(line_items.item_name) AS item_name,
            sum(line_items.quantity) AS order_count,
            sum(line_items.quantity::numeric * line_items.price_ron)::numeric(12,2) AS revenue
           FROM line_items
          WHERE line_items.item_id IS NOT NULL
          GROUP BY line_items.tenant_id, line_items.item_id
        ), ranked AS (
         SELECT aggregated.tenant_id,
            aggregated.item_id,
            aggregated.item_name,
            aggregated.order_count,
            aggregated.revenue,
            row_number() OVER (PARTITION BY aggregated.tenant_id ORDER BY aggregated.revenue DESC, aggregated.order_count DESC) AS rnk
           FROM aggregated
        )
 SELECT tenant_id,
    item_id,
    item_name,
    order_count,
    revenue
   FROM ranked
  WHERE rnk <= 10;
