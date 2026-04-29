-- SECURITY FIX: Enable RLS on all copilot tables.
--
-- Background: The copilot schema was created with RLS intentionally disabled
-- in M1 (see 20260502_001_copilot_init.sql, line 242-245). The comment said
-- "Will be enabled in M2 once owner web view ships." M2 shipped without ever
-- enabling RLS. All 13 copilot tables are now readable and writable by any
-- unauthenticated caller via the Supabase anon key (confirmed 2026-04-29).
--
-- Root cause: The anon role was granted full permissions (SELECT, INSERT,
-- UPDATE, DELETE) on these tables, but because RLS was not enabled, those
-- grants apply without any row-level filter — i.e., every row is visible to
-- everyone.
--
-- Fix: Enable RLS on all 13 tables. Because these tables are ONLY ever
-- accessed via service-role clients (Edge Functions use SUPABASE_SERVICE_ROLE_KEY;
-- the copilot Next.js app uses createAdminClient which also uses the service role),
-- the service-role key bypasses RLS entirely. No existing code path is broken.
--
-- The deny-by-default behaviour for anon and authenticated means that any
-- future query made with an anon or session JWT will return zero rows and
-- refuse writes — which is the correct security posture.
--
-- No RLS policies are added here. Service role = bypass; all else = deny.

ALTER TABLE public.copilot_agents                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_agent_versions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_agent_runs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_content_items              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_messages                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_prompts                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_revenue_events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_subscriptions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_telegram_processed_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_tenant_authorized_users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_tenant_config              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_tenant_facts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_threads                    ENABLE ROW LEVEL SECURITY;
