-- ============================================================================
-- 20260616_015 — marketplace_offers.ai_match_score column (Stream 3 / AI matching)
-- ============================================================================
-- VISION LOCKED 2026-06-16 — Open Marketplace Extensions, Stream 3 (AI Matching).
-- Companion migration to the edge-fn realization of:
--   - supabase/functions/ai-marketplace-match-score
--   - supabase/functions/ai-marketplace-price-suggest
--
-- Purpose:
--   Cache the per-offer AI composite score (0..100, higher = better) on
--   marketplace_offers so the vendor UI can sort/filter offers without
--   re-running the LLM scoring pass on every page load. The score is
--   written by the ai-marketplace-match-score edge fn (idempotent — same
--   listing+offer pair re-uses the cached value).
--
--   ai_jobs row remains the audit + replay surface (job_type =
--   'marketplace_match_score'); this column is the read-fast denormalization.
--
-- ANTI-REGRESSION (CLAUDE.md §5):
--   - Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
--   - REVOKE-before-GRANT not needed — column on an existing table that
--     already has per-role RLS from 20260616_009 (vendor reads offers on
--     own listings, fleet reads own offers). Both surfaces SELECT *, so
--     the new column inherits the existing policy.
--   - No SECDEF helpers added.
--   - Feature flag HIR_FEATURE_AI_MATCHING_ENABLED still gates the edge
--     fn writer; this migration only opens the data slot.
-- ============================================================================

-- 1. Score column (numeric(5,2): 0.00 .. 100.00).
ALTER TABLE public.marketplace_offers
  ADD COLUMN IF NOT EXISTS ai_match_score numeric(5,2)
    CHECK (ai_match_score IS NULL OR (ai_match_score >= 0 AND ai_match_score <= 100));

COMMENT ON COLUMN public.marketplace_offers.ai_match_score IS
  'B2B Marketplace Stream 3 (AI matching). Cached 0..100 composite score from ai-marketplace-match-score edge fn (job_type = marketplace_match_score). NULL until first scoring pass. Higher is better.';

-- 2. Timestamp of last scoring pass (used by the edge fn to decide cached vs re-score).
ALTER TABLE public.marketplace_offers
  ADD COLUMN IF NOT EXISTS ai_match_score_at timestamptz;

COMMENT ON COLUMN public.marketplace_offers.ai_match_score_at IS
  'B2B Marketplace Stream 3. Timestamp the cached ai_match_score was written. NULL = never scored.';

-- 3. Index for vendor UI: list OPEN listings' offers, sorted by score desc.
--    Partial index on PENDING (the only sortable surface — ACCEPTED/REJECTED
--    are terminal and don't need ranking).
CREATE INDEX IF NOT EXISTS ix_marketplace_offers_ai_score
  ON public.marketplace_offers (listing_id, ai_match_score DESC NULLS LAST)
  WHERE status = 'PENDING';

-- 4. Extend ai_jobs.job_type CHECK to include the two marketplace AI types.
--    The original CHECK from 20260616_007 enumerates: dispatch_match,
--    fraud_score, menu_ocr, vendor_brand_copy, support_intent,
--    pricing_suggest, quality_summary, onboarding_assist. We add:
--      - marketplace_match_score  (ai-marketplace-match-score edge fn)
--      - marketplace_price_suggest (ai-marketplace-price-suggest edge fn)
--
--    Postgres doesn't let us ALTER an in-place CHECK; the idempotent
--    pattern is DROP IF EXISTS + ADD with the new enum. Name preserved
--    so future migrations can locate it.
ALTER TABLE public.ai_jobs DROP CONSTRAINT IF EXISTS ai_jobs_job_type_check;
ALTER TABLE public.ai_jobs ADD CONSTRAINT ai_jobs_job_type_check
  CHECK (job_type IN (
    'dispatch_match',
    'fraud_score',
    'menu_ocr',
    'vendor_brand_copy',
    'support_intent',
    'pricing_suggest',
    'quality_summary',
    'onboarding_assist',
    'marketplace_match_score',
    'marketplace_price_suggest'
  ));

-- 5. Partial index for the two marketplace job types (audit/replay surface).
CREATE INDEX IF NOT EXISTS ix_ai_jobs_marketplace
  ON public.ai_jobs(job_type, status, created_at DESC)
  WHERE job_type IN ('marketplace_match_score', 'marketplace_price_suggest');
