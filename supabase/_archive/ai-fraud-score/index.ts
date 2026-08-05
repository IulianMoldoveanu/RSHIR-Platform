// Edge Function: ai-fraud-score
// AI Integration 2026-06-16 — NOT YET LIVE
// Strategy Master Plan Section 6. Job type: fraud_score
// Planned model: claude-haiku-4-5
//
// Purpose: score KYC submissions, payment events, and orders for anomalies
// (mismatched IDs, velocity spikes, COD abuse, geo inconsistencies).
//
// Activation:
// 1. set env HIR_FEATURE_AI_FRAUD_SCORE_ENABLED=true in Supabase project
// 2. set ANTHROPIC_API_KEY in vault
// 3. uncomment the real impl below

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const _supabaseFactory = createClient;
void _supabaseFactory;

Deno.serve(async (_req: Request) => {
  const flag = Deno.env.get("HIR_FEATURE_AI_FRAUD_SCORE_ENABLED");
  if (flag !== "true") {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "ai_feature_not_enabled",
        job_type: "fraud_score",
      }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }
  // TODO: real impl — accept payload, enqueue ai_jobs row, call Anthropic API, write output
  return new Response(
    JSON.stringify({ ok: false, error: "not_implemented" }),
    { status: 501, headers: { "content-type": "application/json" } },
  );
});
