-- Persistent phone+OTP customer accounts (platform-wide, all tenants).
--
-- Today every checkout INSERTs a brand-new `customers` row, even for a
-- phone that has ordered before — there's no unique constraint on phone,
-- so a returning customer accumulates N duplicate rows. This migration:
--   1. Deduplicates existing (tenant_id, phone) groups, repointing every
--      FK that references customers(id) to a single canonical row before
--      deleting the duplicates (loyalty balances, saved addresses, and
--      order history must NOT be lost — see the six FKs handled below).
--   2. Adds a unique index on (tenant_id, phone) so the checkout route can
--      upsert-by-phone going forward instead of blind-inserting.
--
-- This does NOT make an account mandatory — guest checkout is unaffected;
-- this only ensures "the same phone" maps to "the same customer row" so a
-- phone+OTP login (built in a follow-up PR) has something stable to log
-- into. Global (all tenants), per explicit product decision — a login
-- feature shouldn't be tenant-flagged half-built.

do $$
declare
  grp record;
  canonical_id uuid;
  dup_ids uuid[];
begin
  for grp in
    select tenant_id, phone
    from public.customers
    where phone is not null and phone <> ''
    group by tenant_id, phone
    having count(*) > 1
  loop
    -- Canonical = most recently created row in the group (keeps the
    -- freshest name/email the customer typed most recently).
    select id into canonical_id
    from public.customers
    where tenant_id = grp.tenant_id and phone = grp.phone
    order by created_at desc
    limit 1;

    select array_agg(id) into dup_ids
    from public.customers
    where tenant_id = grp.tenant_id and phone = grp.phone and id <> canonical_id;

    if dup_ids is not null and array_length(dup_ids, 1) > 0 then
      update public.restaurant_orders set customer_id = canonical_id
        where customer_id = any(dup_ids);
      update public.customer_addresses set customer_id = canonical_id
        where customer_id = any(dup_ids);
      update public.promo_redemptions set customer_id = canonical_id
        where customer_id = any(dup_ids);
      update public.reservations set customer_id = canonical_id
        where customer_id = any(dup_ids);
      update public.magic_link_tokens set customer_id = canonical_id
        where customer_id = any(dup_ids);

      -- loyalty_accounts: one row per (tenant, customer) — a duplicate
      -- customer may already have its OWN loyalty_accounts row that would
      -- collide with the canonical's on repoint. Merge points into the
      -- canonical account (create one at 0 if it doesn't exist yet), then
      -- let the dup's loyalty_accounts/loyalty_ledger rows cascade-delete
      -- with the dup customer row below — their points already migrated.
      insert into public.loyalty_accounts (tenant_id, customer_id, balance_points)
      select grp.tenant_id, canonical_id, 0
      where not exists (
        select 1 from public.loyalty_accounts
        where tenant_id = grp.tenant_id and customer_id = canonical_id
      );

      update public.loyalty_accounts la
        set balance_points = la.balance_points + coalesce(dup.total_points, 0)
      from (
        select coalesce(sum(balance_points), 0) as total_points
        from public.loyalty_accounts
        where customer_id = any(dup_ids)
      ) dup
      where la.tenant_id = grp.tenant_id and la.customer_id = canonical_id
        and dup.total_points > 0;

      -- Duplicates' own loyalty_accounts/customer_addresses/magic_link_tokens
      -- rows CASCADE-delete automatically. loyalty_ledger rows also cascade
      -- (both account_id and customer_id FKs are ON DELETE CASCADE, no
      -- unique constraint to collide with) — the aggregate balance was
      -- already merged into the canonical account above, so only the
      -- per-transaction history line items for the duplicate are dropped,
      -- not the points themselves. restaurant_orders/promo_redemptions/
      -- reservations were already repointed above (their FKs are ON DELETE
      -- SET NULL, so repointing — not the delete itself — is what saves
      -- them).
      delete from public.customers where id = any(dup_ids);
    end if;
  end loop;
end $$;

create unique index if not exists customers_tenant_phone_unique
  on public.customers (tenant_id, phone)
  where phone is not null and phone <> '';
