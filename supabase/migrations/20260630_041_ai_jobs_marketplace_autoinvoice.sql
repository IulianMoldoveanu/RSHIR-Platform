-- 20260630_041_ai_jobs_marketplace_autoinvoice.sql
-- ⚠️ REVIEW-READY — apply to prod via the Supabase Management API after staging.
-- Merging this file does NOT auto-apply it (this repo applies migrations manually).
--
-- B2B Marketplace settlement fix (gated, audit board). The marketplace-match-accept
-- edge fn enqueues an autoinvoice/settlement job after an accepted match. It targeted
-- a non-existent table (ai_jobs_queue) with non-existent columns and a job_type not in
-- the CHECK, and supabase-js .insert() never throws — so every accepted match (a
-- financial record, is_financial_record=true) was silently created with NO settlement
-- job. The edge fn is fixed to write the real table/columns; this migration adds the
-- 'marketplace_autoinvoice' job_type so that insert is accepted, plus a cheap
-- reconciliation index to find financial matches lacking a job.
--
-- GATED / INERT: marketplace is behind HIR_FEATURE_MARKETPLACE_ENABLED (OFF) — the
-- edge fn returns 503 before Step 7, so nothing enqueues until the feature is activated.
-- This migration only WIDENS a CHECK (permits a new value) + adds an index → no behavior
-- change on apply.
--
-- Idempotent.

-- Drop the existing job_type CHECK by discovering its (generated) name, then re-add a
-- canonically-named one that includes the new value. Robust to the inline-CHECK's
-- auto-generated constraint name (don't hard-code it).
do $$
declare
  r record;
begin
  for r in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'ai_jobs'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%job_type%'
  loop
    execute format('alter table public.ai_jobs drop constraint %I', r.conname);
  end loop;
end$$;

alter table public.ai_jobs
  add constraint ai_jobs_job_type_check
  check (job_type in (
    'dispatch_match',
    'fraud_score',
    'menu_ocr',
    'vendor_brand_copy',
    'support_intent',
    'pricing_suggest',
    'quality_summary',
    'onboarding_assist',
    'marketplace_autoinvoice'   -- NEW: marketplace match → settlement/autofactură enqueue
  ));

-- Reconciliation index: a future sweeper can cheaply find financial matches whose
-- autoinvoice job is missing/incomplete by match_id.
create index if not exists ix_ai_jobs_autoinvoice_match
  on public.ai_jobs ((input_payload ->> 'match_id'))
  where job_type = 'marketplace_autoinvoice';
