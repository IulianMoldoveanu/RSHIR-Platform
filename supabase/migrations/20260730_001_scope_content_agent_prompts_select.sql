-- Security fix: content_agent_prompts_authenticated_select granted
-- `to authenticated using (true)` — unrestricted SELECT on the full
-- prompt_text (system prompts/personas) for every tenant's AI
-- content-generation agents.
--
-- When written, `authenticated` meant restaurant staff. The
-- 2026-07-29 customer-auth migration (20260729_001) made storefront
-- customers real Supabase Auth `authenticated` users too, silently
-- widening this policy to let any customer who signed up read every
-- tenant's internal AI prompt engineering via
-- `select prompt_text, agent_kind, brand_code, persona from content_agent_prompts`.
--
-- Fix: scope to tenant staff only, same join pattern already used by
-- content_metrics_member_select above (content_agent_prompts links to
-- a tenant via brand_code -> content_brand_contexts.tenant_id).
drop policy if exists "content_agent_prompts_authenticated_select" on public.content_agent_prompts;
create policy "content_agent_prompts_authenticated_select"
  on public.content_agent_prompts for select
  to authenticated
  using (
    brand_code in (
      select bc.brand_code from public.content_brand_contexts bc
       where bc.tenant_id in (
         select tenant_id from public.tenant_members where user_id = auth.uid()
       )
    )
  );
