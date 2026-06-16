// Edge Function: marketplace-listing-create
//
// B2B Marketplace foundation 2026-06-16 — NOT YET LIVE
// Wiring planned per Strategy Master Plan Section 5 (B2B Marketplace).
// Activation: set env HIR_FEATURE_MARKETPLACE_ENABLED=true after MVP launch decision.
//
// Contract (planned): POST application/json
//   {
//     vendor_tenant_id: uuid,
//     vertical: 'restaurant'|'pharmacy'|'retail'|'other',
//     city_id?: uuid,
//     delivery_window_start: ISO timestamp,
//     delivery_window_end: ISO timestamp,
//     pickup_address: jsonb,
//     dropoff_address: jsonb,
//     package_description?: string,
//     package_weight_grams?: number,
//     package_temperature?: 'ambient'|'chilled'|'frozen',
//     customer_phone_redacted?: string
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
