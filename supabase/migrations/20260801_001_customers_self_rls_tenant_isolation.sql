-- Close a cross-tenant hole in the customer self-service RLS policies added
-- by 20260729_001_customer_auth_accounts.sql.
--
-- THE BUG
-- That migration's header promised isolation "where auth_user_id = auth.uid()
-- AND tenant_id matches", but the policies it actually created only ever
-- checked `auth_user_id = auth.uid()` — there is no tenant_id predicate:
--
--   customers_self_select   USING (auth_user_id = auth.uid())
--   customers_self_update   USING/CHECK (auth_user_id = auth.uid())
--   customer_addresses_self_all
--                           USING/CHECK (exists customers c
--                             where c.id = customer_id
--                               and c.auth_user_id = auth.uid())
--
-- auth.users is GLOBAL across the platform, so one Google identity maps to
-- one customers row PER TENANT. With no tenant predicate, a session
-- authenticated on tenant A's storefront can reach that person's rows at
-- EVERY other tenant. The attacker is not the customer (it's their own
-- data) — it's tenant A: the storefront page runs JS in the customer's
-- browser and the Supabase access token is deliberately readable there
-- (@supabase/ssr ships auth cookies with httpOnly:false so the browser
-- client can refresh them). So tenant A's own page — or any script injected
-- into it — can call PostgREST with the public anon key as that customer
-- and harvest name/phone/email/loyalty balance plus full saved HOME
-- ADDRESSES from every other restaurant that person orders from. The
-- addresses policy is FOR ALL, so it is write access too: tenant A could
-- rewrite or delete the customer's addresses at tenant B.
--
-- THE FIX
-- Drop the three self-service policies outright rather than bolt a tenant
-- predicate on. RLS has no way to know which tenant's storefront the request
-- came from — the anon key and the JWT are both platform-wide, and the JWT
-- carries no tenant claim — so "AND tenant_id = <this tenant>" is simply not
-- expressible today. Adding it would require a custom access-token hook that
-- stamps a tenant claim at login, which is a much larger change.
--
-- Dropping them costs nothing, because nothing uses them: every read and
-- write of customers / customer_addresses in the storefront already goes
-- through the service-role client server-side, with an explicit
-- `.eq('tenant_id', …)` (lib/account/current-customer.ts,
-- app/(storefront)/account/page.tsx, api/account/*, api/checkout/*). The
-- browser Supabase client is only ever used for auth.* calls and realtime
-- channel subscriptions — it never selects from these tables. Same reasoning
-- the 07-29 migration already applied to INSERT, which was deliberately left
-- to a server action for exactly this "the client must not name its own
-- tenant_id" reason.
--
-- Staff access is untouched: customers_member_all / customer_addresses_member_all
-- gate on is_tenant_member(tenant_id) and remain the only policies on these
-- tables. A storefront customer is never a tenant_member, so an authenticated
-- customer now has no direct PostgREST access to either table at all.
--
-- IF SELF-SERVICE CLIENT ACCESS IS EVER WANTED: add a tenant claim to the
-- access token via a Supabase custom access-token hook, then recreate these
-- policies with `and tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid`.
-- Do NOT recreate them without that claim.

drop policy if exists "customers_self_select" on public.customers;
drop policy if exists "customers_self_update" on public.customers;
drop policy if exists "customer_addresses_self_all" on public.customer_addresses;

comment on column public.customers.auth_user_id is
  'Links to the GLOBAL auth.users identity (Supabase Auth — email/password + '
  'Google/FB/Apple OAuth). NULL for customers who only ever used phone-OTP '
  'recognition and never created a real account. One auth identity has at '
  'most one customer row PER TENANT (idx_customers_tenant_auth_user). '
  'Resolve it SERVER-SIDE only, always paired with an explicit tenant_id '
  'filter — there is no RLS policy letting a customer read this table '
  'directly from the browser, because the JWT carries no tenant claim to '
  'scope such a policy with (see 20260801_001).';
