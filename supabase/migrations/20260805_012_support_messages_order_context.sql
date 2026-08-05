-- Support intake exists and works — rate-limited, service-role write, Telegram
-- forward. What it never carried is which order the customer is complaining
-- about, so "a lipsit o băutură" arrived with no way to tell from which of the
-- day's orders, and nothing to route it by.
--
-- The customer proves which order is theirs by holding its public track token,
-- so the reference is resolved server-side from that token rather than taken
-- from the request body. A customer cannot attach someone else's order.
--
-- courier_order_id is carried alongside deliberately: a delivery complaint
-- belongs to whoever ran the delivery, and this is what a fleet-manager or
-- dispatcher view will filter on when that surface is built.

alter table public.support_messages
  add column if not exists restaurant_order_id uuid references public.restaurant_orders(id) on delete set null,
  add column if not exists courier_order_id uuid references public.courier_orders(id) on delete set null;

-- Both nullable: support that arrives without an order (an account question,
-- a payment question) is still valid support.
create index if not exists idx_support_messages_restaurant_order
  on public.support_messages (restaurant_order_id)
  where restaurant_order_id is not null;

create index if not exists idx_support_messages_courier_order
  on public.support_messages (courier_order_id)
  where courier_order_id is not null;

comment on column public.support_messages.restaurant_order_id is
  'Order the customer is asking about. Resolved server-side from the public track token they hold — never taken from the request body.';
comment on column public.support_messages.courier_order_id is
  'Delivery leg of the same order, when one exists. This is the handle a fleet-manager / dispatcher view filters on.';
