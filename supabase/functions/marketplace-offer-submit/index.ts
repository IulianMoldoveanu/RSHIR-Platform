// Edge Function: marketplace-offer-submit
//
// B2B Marketplace foundation 2026-06-16 — NOT YET LIVE
// Wiring planned per Strategy Master Plan Section 5 (B2B Marketplace).
// Activation: set env HIR_FEATURE_MARKETPLACE_ENABLED=true after MVP launch decision.
//
// Contract (planned): POST application/json
//   {
//     listing_id: uuid,
//     fleet_id: uuid,
//     offered_price_cents: int (>=0),
//     eta_minutes: int (>=0),
//     fleet_rating?: number,
//     notes?: string,
//     expires_at: ISO timestamp
//   }

Deno.serve(async (_req) => {
  if (Deno.env.get('HIR_FEATURE_MARKETPLACE_ENABLED') !== 'true') {
    return new Response(
      JSON.stringify({ ok: false, error: 'marketplace_feature_not_enabled' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    );
  }
  // TODO: real impl when MVP greenlit
  return new Response(
    JSON.stringify({ ok: false, error: 'not_implemented' }),
    { status: 501, headers: { 'content-type': 'application/json' } },
  );
});
