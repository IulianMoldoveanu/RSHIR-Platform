-- Per-delivery tips recorded by the courier (Iulian directive 2026-05-22:
-- "el trebuie sa vada cat a facut brut + bacsis total"). Brut earnings are
-- computed from delivery_fee_ron on DELIVERED orders; tips live here so the
-- calculator can show Brut + Bacșiș + Net cleanly without overloading
-- courier_orders.

create table if not exists public.courier_tips (
  id              uuid        primary key default gen_random_uuid(),
  courier_user_id uuid        not null references auth.users(id) on delete cascade,
  delivery_id     uuid        not null references public.courier_orders(id) on delete cascade,
  amount_ron      numeric(10,2) not null check (amount_ron >= 0 and amount_ron <= 1000),
  recorded_at     timestamptz not null default now(),
  -- A delivery has at most one tip row per courier (one delivery = one
  -- assigned courier, so this is effectively one tip per delivery).
  constraint courier_tips_unique_delivery unique (delivery_id)
);

create index if not exists idx_courier_tips_courier_recorded
  on public.courier_tips (courier_user_id, recorded_at desc);

alter table public.courier_tips enable row level security;

-- Courier sees + writes own tips only.
drop policy if exists "courier_tips_owner_select" on public.courier_tips;
create policy "courier_tips_owner_select"
  on public.courier_tips for select
  to authenticated
  using (courier_user_id = auth.uid());

drop policy if exists "courier_tips_owner_insert" on public.courier_tips;
create policy "courier_tips_owner_insert"
  on public.courier_tips for insert
  to authenticated
  with check (courier_user_id = auth.uid());

drop policy if exists "courier_tips_owner_update" on public.courier_tips;
create policy "courier_tips_owner_update"
  on public.courier_tips for update
  to authenticated
  using (courier_user_id = auth.uid())
  with check (courier_user_id = auth.uid());

drop policy if exists "courier_tips_owner_delete" on public.courier_tips;
create policy "courier_tips_owner_delete"
  on public.courier_tips for delete
  to authenticated
  using (courier_user_id = auth.uid());

-- service_role full access for admin tooling / Control Room aggregates.
drop policy if exists "courier_tips_service_role_all" on public.courier_tips;
create policy "courier_tips_service_role_all"
  on public.courier_tips for all
  to service_role
  using (true)
  with check (true);

comment on table public.courier_tips is
  'Per-delivery tip recorded by the courier. Used by the Calculator card on /dashboard/earnings. Audit trail kept via recorded_at; no soft-delete (DELETE is hard).';
