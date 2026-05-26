-- Wave 5.2 — Audit log for proactive combo push notifications sent to couriers.
-- Used to dedupe (don't push the same courier more than once per 15 min) and
-- to measure ROI (acceptance rate after a combo push).

create table if not exists public.courier_combo_pushes (
  id               uuid primary key default gen_random_uuid(),
  courier_user_id  uuid not null references auth.users(id) on delete cascade,
  anchor_order_id  uuid not null references public.courier_orders(id) on delete cascade,
  combo_order_ids  uuid[] not null default '{}',
  sent_at          timestamptz not null default now(),
  accepted_order_id uuid references public.courier_orders(id) on delete set null,
  accepted_at      timestamptz
);

create index if not exists ix_courier_combo_pushes_courier_sent
  on public.courier_combo_pushes (courier_user_id, sent_at desc);

alter table public.courier_combo_pushes enable row level security;

drop policy if exists "ccp_self_select" on public.courier_combo_pushes;
create policy "ccp_self_select"
  on public.courier_combo_pushes
  for select to authenticated
  using (courier_user_id = auth.uid());

comment on table public.courier_combo_pushes is
  'Audit + dedupe ledger for proactive combo push notifications. The combo-tick '
  'Edge Function checks the last-sent timestamp per courier to avoid spam.';
