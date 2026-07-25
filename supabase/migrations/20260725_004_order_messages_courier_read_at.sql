-- Track when the courier has read a client message, so the rider's home
-- screen (dashboard/page.tsx) can show a "new message" badge on the active
-- order card. Previously the chat thread only existed on the per-order
-- detail page with no unread signal anywhere else, so a client message was
-- easy for a courier to miss entirely while riding.

alter table public.order_messages
  add column if not exists courier_read_at timestamptz;

create index if not exists ix_order_messages_unread_client
  on public.order_messages(courier_order_id)
  where from_role = 'CLIENT' and channel = 'CLIENT_COURIER' and courier_read_at is null;

-- Courier may stamp courier_read_at on CLIENT/CLIENT_COURIER messages for
-- their own assigned order — the only UPDATE this table needs to support.
-- No prior UPDATE policy existed (SELECT + INSERT only), so without this the
-- read-tracking stamp from OrderChat would be silently blocked by RLS.
drop policy if exists "order_messages_update_courier_read" on public.order_messages;
create policy "order_messages_update_courier_read"
  on public.order_messages
  for update using (
    from_role = 'CLIENT'
    and channel = 'CLIENT_COURIER'
    and exists (
      select 1 from public.courier_orders co
       where co.id = order_messages.courier_order_id
         and co.assigned_courier_user_id = auth.uid()
    )
  )
  with check (
    from_role = 'CLIENT'
    and channel = 'CLIENT_COURIER'
    and exists (
      select 1 from public.courier_orders co
       where co.id = order_messages.courier_order_id
         and co.assigned_courier_user_id = auth.uid()
    )
  );
