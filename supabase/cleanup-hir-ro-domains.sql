-- One-shot cleanup: drop any tenants.custom_domain row that still points at
-- *.hir.ro. The Vercel-side attachments were removed via API on 2026-04-28
-- (admin.hir.ro, tenant1.hir.ro, tenant2.hir.ro, hir.ro), so any remaining
-- DB references are dangling and would 404 on lookup anyway.
--
-- Run this once in Supabase SQL Editor.

update public.tenants
   set custom_domain = null,
       domain_status = 'NONE',
       domain_verified_at = null
 where custom_domain ilike '%.hir.ro'
    or custom_domain = 'hir.ro';

-- Sanity-check: should return 0 rows after the update.
select id, slug, custom_domain
  from public.tenants
 where custom_domain ilike '%hir.ro';
