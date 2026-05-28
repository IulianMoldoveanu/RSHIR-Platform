-- Fix infinite-recursion in courier_profiles RLS.
--
-- BUG (since 20260428_002): the `courier_profiles_self_read` policy lets a
-- courier see co-fleet members via a subquery against the same table:
--
--   using (
--     user_id = auth.uid()
--     or fleet_id = (select fleet_id from public.courier_profiles
--                    where user_id = auth.uid())
--   )
--
-- Postgres re-evaluates RLS on the subquery → fires the same policy on
-- itself → ERROR 42P17 "infinite recursion detected in policy".
--
-- Surfaced when a courier uploaded an avatar: the Supabase Storage upload
-- evaluates all applicable INSERT policies on `storage.objects`, including
-- `courier_proofs_assignee_insert`, which probes `courier_orders`, whose
-- `courier_orders_assignee_or_open_select` policy probes `courier_profiles`,
-- which triggers the recursive `courier_profiles_self_read` policy. The
-- whole storage RPC failed with `DatabaseInvalidObjectDefinition`, which
-- the avatar upload component (correctly) mapped to "stocarea nu este
-- configurată" — masking the real RLS bug.
--
-- Fix: extract the "current courier's fleet_id" lookup into a SECURITY
-- DEFINER helper, mirroring the existing `public.is_tenant_member` pattern.
-- SECURITY DEFINER runs as the function owner (superuser-equivalent for
-- migration purposes) → RLS on courier_profiles is bypassed inside the
-- helper → no recursion.
--
-- Idempotent.

create or replace function public.current_courier_fleet_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select fleet_id
  from public.courier_profiles
  where user_id = auth.uid()
  limit 1;
$$;

comment on function public.current_courier_fleet_id() is
  'Returns the fleet_id of the courier_profile owned by auth.uid(), or NULL. SECURITY DEFINER to avoid RLS recursion when called from courier_profiles policies.';

revoke all on function public.current_courier_fleet_id() from public;
grant execute on function public.current_courier_fleet_id() to authenticated, service_role;

-- Replace the recursive policy with a non-recursive one that uses the helper.
drop policy if exists courier_profiles_self_read on public.courier_profiles;
create policy courier_profiles_self_read on public.courier_profiles
  for select to authenticated
  using (
    user_id = auth.uid()
    or fleet_id = public.current_courier_fleet_id()
  );
