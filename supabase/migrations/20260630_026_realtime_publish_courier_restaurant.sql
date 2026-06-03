-- Realtime publication for the order pipeline tables.
--
-- The dispatcher board, restaurant-manager orders list, KDS (kitchen), and the
-- courier "available" pool all subscribe to `postgres_changes` on these tables,
-- but only `order_messages` was ever added to the supabase_realtime publication
-- (20260526_003). As a result those surfaces never received live INSERT/UPDATE
-- events in production and silently relied on manual refresh / partial poll
-- fallbacks. This opts the three order-pipeline tables in.
--
-- RLS still gates every subscriber (a courier only streams rows for their fleet,
-- a tenant only its own orders), so publishing them does not widen access.
--
-- REPLICA IDENTITY FULL is required so UPDATE/DELETE events carry the column
-- values the client-side filters (tenant_id, fleet_id, id) match against.
--
-- Idempotent: safe to re-run. Already applied live to prod (qfme) via the
-- Supabase Management API; this file is the source-of-truth record.

do $$ begin
  alter publication supabase_realtime add table public.courier_orders;
exception
  when duplicate_object then null;
  when undefined_object then null; -- publication absent in local dev
end $$;

do $$ begin
  alter publication supabase_realtime add table public.courier_shifts;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.restaurant_orders;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

alter table public.courier_orders replica identity full;
alter table public.courier_shifts replica identity full;
alter table public.restaurant_orders replica identity full;
