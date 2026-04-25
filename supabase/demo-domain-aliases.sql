-- Demo helper: point the seed tenants at the Vercel auto-generated
-- production URLs so the platform is reachable without owning hir.ro.
-- Idempotent: re-run any time. Reverse with `update tenants set
-- custom_domain = null where slug in ('tenant1','tenant2');`.

update public.tenants
   set custom_domain = 'hir-restaurant-web.vercel.app',
       domain_status = 'ACTIVE'
 where slug = 'tenant1';

-- tenant2 has no second Vercel URL of its own, so for demo it's
-- reachable only via a `?tenant=tenant2` override (TODO) or after
-- DNS is configured. Leaving its custom_domain unset.

select slug, name, custom_domain from public.tenants order by slug;
