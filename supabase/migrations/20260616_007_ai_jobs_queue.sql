-- AI Integration queue 2026-06-16 — NOT YET WIRED.
-- Strategy Master Plan Section 6 (AI Integration scaffolding).
-- Idempotent migration: safe to re-apply.
-- Activation: implement per-job-type handlers + set HIR_FEATURE_AI_<TYPE>_ENABLED=true.

CREATE TABLE IF NOT EXISTS ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL CHECK (job_type IN (
    'dispatch_match',         -- match courier↔order
    'fraud_score',            -- KYC/payment/order anomaly
    'menu_ocr',               -- photo → product list (Vision)
    'vendor_brand_copy',      -- brand page generation
    'support_intent',         -- Hepi customer/vendor/courier/fleet support
    'pricing_suggest',        -- dynamic delivery pricing
    'quality_summary',        -- delivery review sentiment + trend
    'onboarding_assist'       -- KYF anamneza, tariff suggestion
  )),
  tenant_id uuid,              -- optional scope
  partner_id uuid,             -- optional scope
  input_payload jsonb NOT NULL,
  output_payload jsonb,
  model_used text,              -- e.g. claude-sonnet-4-6, claude-haiku-4-5
  input_tokens int,
  output_tokens int,
  cost_bani int,                -- approx cost in bani for the run
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED')),
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS ix_ai_jobs_status_type ON ai_jobs(status, job_type, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_ai_jobs_tenant ON ai_jobs(tenant_id, created_at DESC) WHERE tenant_id IS NOT NULL;

-- RLS DENY all (service_role only for now)
ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_anon_ai_jobs" ON ai_jobs;
CREATE POLICY "deny_all_anon_ai_jobs" ON ai_jobs AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE ai_jobs IS 'AI Integration queue 2026-06-16. NOT YET WIRED. Strategy Master Plan Section 6. Activation: implement per-job-type handlers, set env HIR_FEATURE_AI_<TYPE>_ENABLED=true.';
